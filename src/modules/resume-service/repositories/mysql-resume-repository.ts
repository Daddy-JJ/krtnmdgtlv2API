import { randomUUID } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { ResumeRequestInput } from '../dto/resume-input.ts';

type AuthorityRow = RowDataPacket & {
  user_id:number; email:string; email_verified_at:Date|null; subscription_id:number;
  subscription_public_id:string; starts_at:Date; ends_at:Date; period_id:number|null;
  entitlement_id:number|null; beneficiary_name:string|null; request_public_id:string|null; request_status:string|null;
};

export class MySqlResumeRepository {
  readonly #pool:Pool;
  constructor(pool:Pool){this.#pool=pool;}

  async eligibility(userPublicId:string){
    const [rows]=await this.#pool.execute<AuthorityRow[]>(`SELECT u.id user_id,u.email,u.email_verified_at,s.id subscription_id,s.public_id subscription_public_id,
      s.starts_at,s.ends_at,sp.id period_id,e.id entitlement_id,e.beneficiary_name,r.public_id request_public_id,r.status request_status
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id=u.id AND s.status='active' AND s.starts_at<=UTC_TIMESTAMP() AND s.ends_at>UTC_TIMESTAMP()
      LEFT JOIN plans p ON p.id=s.plan_id AND p.code='pro'
      LEFT JOIN subscription_periods sp ON sp.subscription_id=s.id AND sp.period_start=s.starts_at AND sp.period_end=s.ends_at
      LEFT JOIN resume_service_entitlements e ON e.subscription_period_id=sp.id
      LEFT JOIN resume_requests r ON r.entitlement_id=e.id
      WHERE u.public_id=? AND u.status='active' AND (s.id IS NULL OR p.id IS NOT NULL)
      ORDER BY s.ends_at DESC LIMIT 1`,[userPublicId]);
    const row=rows[0];
    if(!row)return null;
    return {email:row.email,emailVerified:row.email_verified_at!==null,hasActivePro:Boolean(row.subscription_id),subscriptionPublicId:row.subscription_public_id??null,
      periodStart:row.starts_at??null,periodEnd:row.ends_at??null,beneficiaryName:row.beneficiary_name,requestPublicId:row.request_public_id,
      requestStatus:row.request_status,available:Boolean(row.subscription_id&&row.email_verified_at&&!row.request_public_id)};
  }

  async create(userPublicId:string,input:ResumeRequestInput){
    const connection=await this.#pool.getConnection();
    try{
      await connection.beginTransaction();
      const [rows]=await connection.execute<AuthorityRow[]>(`SELECT u.id user_id,u.email,u.email_verified_at,s.id subscription_id,s.public_id subscription_public_id,s.starts_at,s.ends_at,
        NULL period_id,NULL entitlement_id,NULL beneficiary_name,NULL request_public_id,NULL request_status
        FROM users u JOIN subscriptions s ON s.user_id=u.id AND s.status='active' AND s.starts_at<=UTC_TIMESTAMP() AND s.ends_at>UTC_TIMESTAMP()
        JOIN plans p ON p.id=s.plan_id AND p.code='pro' WHERE u.public_id=? AND u.status='active' ORDER BY s.ends_at DESC LIMIT 1 FOR UPDATE`,[userPublicId]);
      const authority=rows[0];
      if(!authority){await connection.rollback();return 'pro_required' as const;}
      if(!authority.email_verified_at){await connection.rollback();return 'email_unverified' as const;}
      const [active]=await connection.execute<Array<RowDataPacket&{id:number}>>(`SELECT id FROM resume_requests WHERE user_id=? AND status NOT IN ('COMPLETED','EXPIRED','CANCELLED','ARCHIVED') LIMIT 1 FOR UPDATE`,[authority.user_id]);
      if(active[0]){await connection.rollback();return 'active_exists' as const;}
      const [periodRows]=await connection.execute<Array<RowDataPacket&{id:number}>>(`SELECT id FROM subscription_periods WHERE subscription_id=? AND period_start=? AND period_end=? FOR UPDATE`,[authority.subscription_id,authority.starts_at,authority.ends_at]);
      let periodId=periodRows[0]?.id;
      if(!periodId){
        const [period]=await connection.execute<ResultSetHeader>(`INSERT INTO subscription_periods(public_id,subscription_id,period_start,period_end,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())`,[randomUUID(),authority.subscription_id,authority.starts_at,authority.ends_at]);
        periodId=period.insertId;
      }
      const [entRows]=await connection.execute<Array<RowDataPacket&{id:number;beneficiary_name_normalized:string|null;consumed_at:Date|null}>>(`SELECT id,beneficiary_name_normalized,consumed_at FROM resume_service_entitlements WHERE subscription_period_id=? FOR UPDATE`,[periodId]);
      const normalized=input.beneficiaryName.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID');
      let entitlementId=entRows[0]?.id;
      if(entRows[0]?.consumed_at){await connection.rollback();return 'entitlement_used' as const;}
      if(entRows[0]?.beneficiary_name_normalized&&entRows[0].beneficiary_name_normalized!==normalized){await connection.rollback();return 'beneficiary_locked' as const;}
      if(!entitlementId){
        const [ent]=await connection.execute<ResultSetHeader>(`INSERT INTO resume_service_entitlements(public_id,user_id,subscription_period_id,beneficiary_name,beneficiary_name_normalized,created_at,updated_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[randomUUID(),authority.user_id,periodId,input.beneficiaryName,normalized]);
        entitlementId=ent.insertId;
      }
      const publicId=randomUUID(),now=new Date(),status=input.pastedResumeText?.trim()?'SUBMITTED':'DRAFT';
      await connection.execute(`INSERT INTO resume_requests(public_id,entitlement_id,user_id,beneficiary_name_snapshot,account_email_snapshot,whatsapp_number,current_job_title,current_organization,experience_years,career_level,target_role,target_industry,target_company,target_country,resume_language,resume_style,linkedin_url,pasted_resume_text,pasted_job_description,additional_achievements,certifications,user_notes,status,submitted_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[publicId,entitlementId,authority.user_id,input.beneficiaryName,authority.email,input.whatsappNumber,input.currentJobTitle,input.currentOrganization??null,input.experienceYears??null,input.careerLevel,input.targetRole,input.targetIndustry,input.targetCompany??null,input.targetCountry,input.resumeLanguage,input.resumeStyle,input.linkedinUrl??null,input.pastedResumeText??null,input.pastedJobDescription??null,input.additionalAchievements??null,input.certifications??null,input.userNotes??null,status,status==='SUBMITTED'?now:null,now,now]);
      await connection.execute(`UPDATE resume_service_entitlements SET consumed_at=?,updated_at=? WHERE id=?`,[now,now,entitlementId]);
      const [requestRows]=await connection.execute<Array<RowDataPacket&{id:number}>>(`SELECT id FROM resume_requests WHERE public_id=?`,[publicId]);
      await connection.execute(`INSERT INTO resume_request_status_logs(request_id,from_status,to_status,changed_by_user_id,reason,created_at) VALUES(?,NULL,?,?,?,?)`,[requestRows[0]!.id,status,authority.user_id,status==='SUBMITTED'?'Member submitted pasted resume':'Member created upload draft',now]);
      await connection.commit();
      return {publicId,status,submittedAt:status==='SUBMITTED'?now:null};
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }

  async listOwned(userPublicId:string){
    const [rows]=await this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT r.public_id publicId,r.beneficiary_name_snapshot beneficiaryName,r.target_role targetRole,r.status,r.priority,r.revision_count revisionCount,r.max_revisions maxRevisions,r.sla_due_at slaDueAt,r.completed_at completedAt,r.retention_expires_at retentionExpiresAt,r.created_at createdAt
      FROM resume_requests r JOIN users u ON u.id=r.user_id WHERE u.public_id=? ORDER BY r.created_at DESC`,[userPublicId]);
    return rows;
  }

  async ownedDetail(userPublicId:string,publicId:string){
    const [rows]=await this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT r.public_id publicId,r.beneficiary_name_snapshot beneficiaryName,r.target_role targetRole,r.target_industry targetIndustry,r.target_country targetCountry,r.career_level careerLevel,r.resume_language resumeLanguage,r.resume_style resumeStyle,r.status,r.priority,r.revision_count revisionCount,r.max_revisions maxRevisions,r.submitted_at submittedAt,r.sla_due_at slaDueAt,r.completed_at completedAt,r.retention_expires_at retentionExpiresAt,UTC_TIMESTAMP() currentServerTime
      FROM resume_requests r JOIN users u ON u.id=r.user_id WHERE u.public_id=? AND r.public_id=? LIMIT 1`,[userPublicId,publicId]);
    return rows[0]??null;
  }

  async requestRevision(userPublicId:string,publicId:string,notes:string){
    const connection=await this.#pool.getConnection();
    try{await connection.beginTransaction();
      const [rows]=await connection.execute<Array<RowDataPacket&{id:number;user_id:number;status:string;revision_count:number;max_revisions:number}>>(`SELECT r.id,r.user_id,r.status,r.revision_count,r.max_revisions FROM resume_requests r JOIN users u ON u.id=r.user_id WHERE u.public_id=? AND r.public_id=? FOR UPDATE`,[userPublicId,publicId]);
      const row=rows[0];if(!row){await connection.rollback();return 'not_found' as const;}if(row.status!=='COMPLETED'){await connection.rollback();return 'invalid_status' as const;}if(row.revision_count>=row.max_revisions){await connection.rollback();return 'limit' as const;}
      const revision=row.revision_count+1,now=new Date();
      await connection.execute(`INSERT INTO resume_revision_requests(public_id,request_id,revision_number,user_notes,status,requested_at) VALUES(?,?,?,?,'REQUESTED',?)`,[randomUUID(),row.id,revision,notes,now]);
      await connection.execute(`UPDATE resume_requests SET revision_count=?,status='REVISION_REQUESTED',updated_at=? WHERE id=?`,[revision,now,row.id]);
      await connection.execute(`INSERT INTO resume_request_status_logs(request_id,from_status,to_status,changed_by_user_id,reason,created_at) VALUES(?,'COMPLETED','REVISION_REQUESTED',?,?,?)`,[row.id,row.user_id,notes,now]);
      await connection.commit();return {revisionNumber:revision,status:'REVISION_REQUESTED'};
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }

  async queue(actorPublicId:string,canAccessPool:boolean){
    const [rows]=await this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT r.public_id publicId,u.email accountUser,r.beneficiary_name_snapshot beneficiary,r.target_role targetRole,r.target_industry targetIndustry,r.career_level careerLevel,r.resume_language language,r.submitted_at submittedAt,r.status,r.priority,s.email assignedSpecialist,r.sla_due_at slaDue,r.revision_count revisionCount
      FROM resume_requests r JOIN users u ON u.id=r.user_id LEFT JOIN users s ON s.id=r.assigned_specialist_id
      WHERE (?=1 OR s.public_id=?)
      ORDER BY (r.sla_due_at IS NOT NULL AND r.sla_due_at<UTC_TIMESTAMP()) DESC,r.sla_due_at IS NULL,r.sla_due_at ASC,r.submitted_at ASC,r.created_at DESC`,[canAccessPool?1:0,actorPublicId]);
    return rows;
  }

  async operationalDetail(actorPublicId:string,publicId:string,canAccessPool:boolean){
    const [summaryRows]=await this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT r.id internalId,r.public_id publicId,u.email accountUser,r.beneficiary_name_snapshot beneficiary,r.current_job_title currentJobTitle,r.current_organization currentOrganization,r.experience_years experienceYears,r.career_level careerLevel,r.target_role targetRole,r.target_industry targetIndustry,r.target_company targetCompany,r.target_country targetCountry,r.resume_language language,r.resume_style resumeStyle,r.linkedin_url linkedinUrl,r.pasted_resume_text pastedResumeText,r.pasted_job_description pastedJobDescription,r.additional_achievements additionalAchievements,r.certifications,r.user_notes userNotes,r.status,r.priority,r.revision_count revisionCount,r.max_revisions maxRevisions,r.submitted_at submittedAt,r.data_complete_at dataCompleteAt,r.sla_due_at slaDueAt,r.sla_paused_at slaPausedAt,r.completed_at completedAt,r.retention_expires_at retentionExpiresAt,s.public_id assignedSpecialistPublicId,s.email assignedSpecialist
      FROM resume_requests r JOIN users u ON u.id=r.user_id LEFT JOIN users s ON s.id=r.assigned_specialist_id
      WHERE r.public_id=? AND (?=1 OR s.public_id=?) LIMIT 1`,[publicId,canAccessPool?1:0,actorPublicId]);
    const summary=summaryRows[0];
    if(!summary)return null;
    const requestId=Number(summary.internalId);
    delete summary.internalId;
    const [files,messages,deliverables,revisions,sla,audit]=await Promise.all([
      this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT f.public_id publicId,f.file_role role,f.original_filename filename,f.extension,f.size_bytes sizeBytes,f.scan_status scanStatus,f.created_at createdAt,u.email uploadedBy FROM resume_request_files f JOIN users u ON u.id=f.uploaded_by_user_id WHERE f.resume_request_id=? AND f.deleted_at IS NULL ORDER BY f.created_at`,[requestId]).then(([rows])=>rows),
      this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT m.public_id publicId,m.visibility,m.message,m.created_at createdAt,u.email sender FROM resume_request_messages m JOIN users u ON u.id=m.sender_user_id WHERE m.request_id=? ORDER BY m.created_at`,[requestId]).then(([rows])=>rows),
      this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT d.public_id publicId,d.version_number versionNumber,d.revision_number revisionNumber,d.state,d.is_current isCurrent,d.release_notes releaseNotes,d.internal_notes internalNotes,d.released_at releasedAt,d.created_at createdAt,f.public_id filePublicId,f.original_filename filename FROM resume_deliverables d JOIN resume_request_files f ON f.id=d.file_id WHERE d.request_id=? ORDER BY d.version_number DESC`,[requestId]).then(([rows])=>rows),
      this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT public_id publicId,revision_number revisionNumber,user_notes userNotes,status,requested_at requestedAt,completed_at completedAt FROM resume_revision_requests WHERE request_id=? ORDER BY revision_number DESC`,[requestId]).then(([rows])=>rows),
      this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT event_type eventType,event_at eventAt,prior_due_at priorDueAt,new_due_at newDueAt,reason FROM resume_request_sla_events WHERE request_id=? ORDER BY event_at`,[requestId]).then(([rows])=>rows),
      this.#pool.execute<Array<RowDataPacket&Record<string,unknown>>>(`SELECT l.from_status fromStatus,l.to_status toStatus,l.reason,l.created_at createdAt,u.email actor FROM resume_request_status_logs l JOIN users u ON u.id=l.changed_by_user_id WHERE l.request_id=? ORDER BY l.created_at`,[requestId]).then(([rows])=>rows),
    ]);
    return{summary,files,messages,deliverables,revisions,sla,audit};
  }
}
