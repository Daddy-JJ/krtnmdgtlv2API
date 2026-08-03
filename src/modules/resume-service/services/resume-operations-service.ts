import{randomUUID}from'node:crypto';
import type{Pool,ResultSetHeader,RowDataPacket}from'mysql2/promise';
import{AppError}from'../../../shared/http/errors.ts';
import type{RbacService}from'../../../shared/security/rbac-service.ts';
import{ResumeServiceSlaCalculator}from'./resume-service-sla-calculator.ts';

const allowed:Record<string,readonly string[]>={SUBMITTED:['ASSIGNED','NEED_MORE_INFORMATION','DATA_COMPLETE'],ASSIGNED:['NEED_MORE_INFORMATION','DATA_COMPLETE'],NEED_MORE_INFORMATION:['DATA_COMPLETE'],DATA_COMPLETE:['IN_PROGRESS'],IN_PROGRESS:['READY_FOR_REVIEW','NEED_MORE_INFORMATION'],READY_FOR_REVIEW:['COMPLETED'],COMPLETED:['REVISION_REQUESTED','EXPIRED','ARCHIVED'],REVISION_REQUESTED:['REVISION_IN_PROGRESS'],REVISION_IN_PROGRESS:['READY_FOR_REVIEW','COMPLETED']};

export class ResumeOperationsService{
  readonly #pool:Pool;readonly #rbac:RbacService;readonly #sla=new ResumeServiceSlaCalculator();
  constructor(pool:Pool,rbac:RbacService){this.#pool=pool;this.#rbac=rbac;}
  async assign(actor:string,requestPublicId:string,specialistPublicId:string,reason:string){
    await this.#rbac.assert(actor,'resume.admin');const c=await this.#pool.getConnection();
    try{await c.beginTransaction();const ids=await this.#ids(c,actor,requestPublicId);const [specialists]=await c.execute<Array<RowDataPacket&{id:number}>>(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN roles r ON r.id=ur.role_id WHERE u.public_id=? AND u.status='active' AND r.code IN ('cv_specialist','resume_quality_reviewer','resume_service_admin') LIMIT 1`,[specialistPublicId]);const specialist=specialists[0];if(!specialist)throw new AppError(422,'RESUME_REQUEST_NOT_ASSIGNED','Selected specialist is not eligible.');
      await c.execute(`UPDATE resume_request_assignments SET unassigned_at=UTC_TIMESTAMP(),reason=? WHERE request_id=? AND unassigned_at IS NULL`,[reason,ids.requestId]);
      await c.execute(`INSERT INTO resume_request_assignments(request_id,specialist_user_id,assigned_by_user_id,assigned_at,reason) VALUES(?,?,?,UTC_TIMESTAMP(),?)`,[ids.requestId,specialist.id,ids.actorId,reason]);
      await c.execute(`UPDATE resume_requests SET assigned_specialist_id=?,status=CASE WHEN status='SUBMITTED' THEN 'ASSIGNED' ELSE status END,updated_at=UTC_TIMESTAMP() WHERE id=?`,[specialist.id,ids.requestId]);
      await c.execute(`INSERT INTO resume_request_status_logs(request_id,from_status,to_status,changed_by_user_id,reason,created_at) SELECT id,'SUBMITTED','ASSIGNED',?,?,UTC_TIMESTAMP() FROM resume_requests WHERE id=? AND status='ASSIGNED'`,[ids.actorId,reason,ids.requestId]);
      await c.commit();return{assignedSpecialistPublicId:specialistPublicId};
    }catch(e){await c.rollback();throw e;}finally{c.release();}
  }
  async transition(actor:string,requestPublicId:string,target:string,reason?:string){
    const permissions=await this.#rbac.permissions(actor);if(!permissions.has('resume.work')&&!permissions.has('resume.admin'))throw new AppError(403,'PERMISSION_REQUIRED','Resume work permission is required.');
    const c=await this.#pool.getConnection();try{await c.beginTransaction();const ids=await this.#ids(c,actor,requestPublicId);const [rows]=await c.execute<Array<RowDataPacket&{status:string;assigned_specialist_id:number|null;sla_due_at:Date|null;sla_remaining_seconds:number|null}>>(`SELECT status,assigned_specialist_id,sla_due_at,sla_remaining_seconds FROM resume_requests WHERE id=? FOR UPDATE`,[ids.requestId]);const row=rows[0]!;
      if(!permissions.has('resume.admin')&&row.assigned_specialist_id!==ids.actorId)throw new AppError(403,'RESUME_REQUEST_NOT_ASSIGNED','Request is not assigned to this specialist.');
      if(!allowed[row.status]?.includes(target))throw new AppError(409,'RESUME_REQUEST_INVALID_STATUS','Invalid resume request transition.');
      if(target==='NEED_MORE_INFORMATION'&&(!reason||reason.trim().length<10))throw new AppError(422,'RESUME_INFORMATION_MESSAGE_REQUIRED','A user-visible information request is required.');
      const now=new Date();let due=row.sla_due_at,remaining=row.sla_remaining_seconds;
      if(target==='NEED_MORE_INFORMATION'&&due){remaining=this.#sla.remainingSeconds(now,due);due=null;}
      if(target==='DATA_COMPLETE'){due=remaining?this.#sla.resumeAt(now,remaining):this.#sla.dueAt(now);remaining=null;}
      await c.execute(`UPDATE resume_requests SET status=?,data_complete_at=CASE WHEN ?='DATA_COMPLETE' THEN ? ELSE data_complete_at END,sla_due_at=?,sla_paused_at=CASE WHEN ?='NEED_MORE_INFORMATION' THEN ? ELSE NULL END,sla_remaining_seconds=?,updated_at=? WHERE id=?`,[target,target,now,due,target,now,remaining,now,ids.requestId]);
      await c.execute(`INSERT INTO resume_request_status_logs(request_id,from_status,to_status,changed_by_user_id,reason,created_at) VALUES(?,?,?,?,?,?)`,[ids.requestId,row.status,target,ids.actorId,reason??null,now]);
      if(target==='NEED_MORE_INFORMATION')await c.execute(`INSERT INTO resume_request_messages(public_id,request_id,sender_user_id,visibility,message,created_at) VALUES(?,?,?,'USER_VISIBLE',?,?)`,[randomUUID(),ids.requestId,ids.actorId,reason!.trim(),now]);
      if(target==='DATA_COMPLETE'||target==='NEED_MORE_INFORMATION')await c.execute(`INSERT INTO resume_request_sla_events(request_id,event_type,event_at,prior_due_at,new_due_at,reason,created_by_user_id) VALUES(?,?,?,?,?,?,?)`,[ids.requestId,target==='DATA_COMPLETE'?(row.sla_due_at?'RESUMED':'STARTED'):'PAUSED',now,row.sla_due_at,due,reason??null,ids.actorId]);
      await c.commit();return{status:target,slaDueAt:due};
    }catch(e){await c.rollback();throw e;}finally{c.release();}
  }
  async registerDeliverable(actor:string,requestPublicId:string,filePublicId:string,releaseNotes:string,internalNotes:string|null){
    const permissions=await this.#rbac.permissions(actor);if(!permissions.has('resume.work')&&!permissions.has('resume.admin'))throw new AppError(403,'PERMISSION_REQUIRED','Resume work permission is required.');
    const c=await this.#pool.getConnection();try{await c.beginTransaction();const ids=await this.#ids(c,actor,requestPublicId);const [requests]=await c.execute<Array<RowDataPacket&{status:string;assigned_specialist_id:number|null}>>(`SELECT status,assigned_specialist_id FROM resume_requests WHERE id=? FOR UPDATE`,[ids.requestId]);const request=requests[0]!;
      if(!permissions.has('resume.admin')&&request.assigned_specialist_id!==ids.actorId)throw new AppError(403,'RESUME_REQUEST_NOT_ASSIGNED','Request is not assigned to this specialist.');
      if(!['IN_PROGRESS','REVISION_IN_PROGRESS'].includes(request.status))throw new AppError(409,'RESUME_REQUEST_INVALID_STATUS','Request is not ready for a deliverable candidate.');
      const [files]=await c.execute<Array<RowDataPacket&{id:number;extension:string;scan_status:string}>>(`SELECT id,extension,scan_status FROM resume_request_files WHERE public_id=? AND resume_request_id=? AND file_role='DELIVERABLE' AND deleted_at IS NULL FOR UPDATE`,[filePublicId,ids.requestId]);const file=files[0];if(!file||file.extension!=='docx'||!file.scan_status.startsWith('CLEAN'))throw new AppError(422,'RESUME_OUTPUT_MUST_BE_DOCX','A validated DOCX deliverable is required.');
      const [versions]=await c.execute<Array<RowDataPacket&{next_version:number;revision_count:number}>>(`SELECT COALESCE(MAX(d.version_number),0)+1 next_version,r.revision_count FROM resume_requests r LEFT JOIN resume_deliverables d ON d.request_id=r.id WHERE r.id=? GROUP BY r.id,r.revision_count`,[ids.requestId]);const v=versions[0]!;
      const publicId=randomUUID();await c.execute(`INSERT INTO resume_deliverables(public_id,request_id,version_number,file_id,uploaded_by_user_id,revision_number,state,is_current,release_notes,internal_notes,created_at) VALUES(?,?,?,?,?,?,'REVIEW_CANDIDATE',0,?,?,UTC_TIMESTAMP())`,[publicId,ids.requestId,v.next_version,file.id,ids.actorId,v.revision_count,releaseNotes,internalNotes]);
      await c.execute(`UPDATE resume_requests SET status='READY_FOR_REVIEW',updated_at=UTC_TIMESTAMP() WHERE id=?`,[ids.requestId]);
      await c.execute(`INSERT INTO resume_request_status_logs(request_id,from_status,to_status,changed_by_user_id,reason,created_at) VALUES(?,?,'READY_FOR_REVIEW',?,'Deliverable candidate submitted for quality review',UTC_TIMESTAMP())`,[ids.requestId,request.status,ids.actorId]);
      await c.commit();return{publicId,versionNumber:v.next_version,state:'REVIEW_CANDIDATE'};
    }catch(e){await c.rollback();throw e;}finally{c.release();}
  }
  async release(actor:string,requestPublicId:string,deliverablePublicId:string,checks:Record<string,boolean>,notes?:string){
    await this.#rbac.assert(actor,'resume.release');if(Object.values(checks).length<8||Object.values(checks).some(v=>v!==true))throw new AppError(422,'RESUME_INFORMATION_INCOMPLETE','All quality confirmations are required.');
    const c=await this.#pool.getConnection();try{await c.beginTransaction();const ids=await this.#ids(c,actor,requestPublicId);const [rows]=await c.execute<Array<RowDataPacket&{id:number;status:string;sla_due_at:Date|null;account_email_snapshot:string}>>(`SELECT id,status,sla_due_at,account_email_snapshot FROM resume_requests WHERE id=? FOR UPDATE`,[ids.requestId]);const request=rows[0]!;if(request.status!=='READY_FOR_REVIEW')throw new AppError(409,'RESUME_REQUEST_INVALID_STATUS','Request is not ready for release.');
      const [deliverables]=await c.execute<Array<RowDataPacket&{id:number}>>(`SELECT id FROM resume_deliverables WHERE request_id=? AND public_id=? AND state='REVIEW_CANDIDATE' AND revoked_at IS NULL FOR UPDATE`,[ids.requestId,deliverablePublicId]);const d=deliverables[0];if(!d)throw new AppError(404,'RESUME_REQUEST_NOT_FOUND','Deliverable was not found.');
      const now=new Date(),expiry=new Date(now.getTime()+90*86400000);
      await c.execute(`INSERT INTO resume_quality_reviews(request_id,deliverable_id,reviewer_user_id,beneficiary_correct,factual_integrity_checked,spelling_formatting_checked,file_opens,no_macros,no_tracked_changes_comments,no_placeholders,ready_for_release,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,[ids.requestId,d.id,ids.actorId,1,1,1,1,1,1,1,1,notes??null,now]);
      await c.execute(`UPDATE resume_deliverables SET is_current=0 WHERE request_id=?`,[ids.requestId]);await c.execute(`UPDATE resume_deliverables SET is_current=1,state='RELEASED',released_at=? WHERE id=?`,[now,d.id]);
      await c.execute(`UPDATE resume_requests SET status='COMPLETED',completed_at=?,retention_expires_at=?,updated_at=? WHERE id=?`,[now,expiry,now,ids.requestId]);
      await c.execute(`UPDATE resume_revision_requests SET status='COMPLETED',completed_at=? WHERE request_id=? AND status IN ('REQUESTED','IN_PROGRESS')`,[now,ids.requestId]);
      await c.execute(`INSERT INTO resume_request_status_logs(request_id,from_status,to_status,changed_by_user_id,reason,created_at) VALUES(?,'READY_FOR_REVIEW','COMPLETED',?,'Quality review passed and deliverable released',?)`,[ids.requestId,ids.actorId,now]);
      await c.execute(`INSERT INTO resume_request_sla_events(request_id,event_type,event_at,prior_due_at,new_due_at,reason,created_by_user_id) VALUES(?,?,?, ?,NULL,'Official release',?)`,[ids.requestId,request.sla_due_at&&now>request.sla_due_at?'BREACHED':'MET',now,request.sla_due_at,ids.actorId]);
      await c.execute(`INSERT INTO mail_outbox(public_id,user_id,template_key,recipient_email,subject,payload_text,priority,status,attempts,max_attempts,available_at,created_at,updated_at) SELECT ?,user_id,'resume.completed',?,'Resume Enhancement Anda siap',?,50,'queued',0,3,?,?,? FROM resume_requests WHERE id=?`,[randomUUID(),request.account_email_snapshot,JSON.stringify({requestPublicId,retentionExpiresAt:expiry.toISOString()}),now,now,now,ids.requestId]);
      await c.commit();return{status:'COMPLETED',completedAt:now,retentionExpiresAt:expiry};
    }catch(e){await c.rollback();throw e;}finally{c.release();}
  }
  async #ids(c:Awaited<ReturnType<Pool['getConnection']>>,actor:string,request:string){const [rows]=await c.execute<Array<RowDataPacket&{request_id:number;actor_id:number}>>(`SELECT r.id request_id,u.id actor_id FROM resume_requests r JOIN users u ON u.public_id=? AND u.status='active' WHERE r.public_id=? LIMIT 1`,[actor,request]);if(!rows[0])throw new AppError(404,'RESUME_REQUEST_NOT_FOUND','Resume request was not found.');return{requestId:rows[0].request_id,actorId:rows[0].actor_id};}
}
