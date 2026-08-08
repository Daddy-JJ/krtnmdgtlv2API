import{randomUUID}from'node:crypto';
import type{Pool,RowDataPacket}from'mysql2/promise';
import{AppError}from'../../../shared/http/errors.ts';
import type{RbacService}from'../../../shared/security/rbac-service.ts';
import{validateResumeFile,type ResumeFileRole}from'./resume-file-validator.ts';
import type{ResumePrivateStorage}from'./resume-private-storage.ts';

export class ResumeFileService{
  readonly pool:Pool;readonly storage:ResumePrivateStorage;readonly rbac:RbacService;
  constructor(pool:Pool,storage:ResumePrivateStorage,rbac:RbacService){this.pool=pool;this.storage=storage;this.rbac=rbac;}
  async upload(actor:string,requestPublicId:string,role:ResumeFileRole,file:{originalname:string;buffer:Buffer}){
    const [rows]=await this.pool.execute<Array<RowDataPacket&{id:number;user_id:number;owner_public_id:string;assigned_public_id:string|null;status:string}>>(`SELECT r.id,r.user_id,u.public_id owner_public_id,s.public_id assigned_public_id,r.status FROM resume_requests r JOIN users u ON u.id=r.user_id LEFT JOIN users s ON s.id=r.assigned_specialist_id WHERE r.public_id=? LIMIT 1`,[requestPublicId]);
    const request=rows[0];if(!request)throw new AppError(404,'RESUME_REQUEST_NOT_FOUND','Resume request was not found.');
    const internal=role==='WORKING_DRAFT'||role==='DELIVERABLE';
    if(internal){
      const permissions=await this.rbac.permissions(actor);
      if(request.assigned_public_id===actor){if(!permissions.has('resume.work'))throw new AppError(403,'PERMISSION_REQUIRED','Resume work permission is required.');}
      else if(!permissions.has('resume.admin'))throw new AppError(403,'RESUME_REQUEST_NOT_ASSIGNED','Request is not assigned to this specialist.');
    }
    else if(request.owner_public_id!==actor)throw new AppError(404,'RESUME_REQUEST_NOT_FOUND','Resume request was not found.');
    const metadata=validateResumeFile(role,file.originalname,file.buffer);
    const stored=await this.storage.write(request.owner_public_id,requestPublicId,role,file.originalname,file.buffer);
    const [users]=await this.pool.execute<Array<RowDataPacket&{id:number}>>(`SELECT id FROM users WHERE public_id=? LIMIT 1`,[actor]);
    try{
      const publicId=randomUUID();
      await this.pool.execute(`INSERT INTO resume_request_files(public_id,resume_request_id,uploaded_by_user_id,file_role,original_filename,stored_filename,storage_disk,storage_path,extension,detected_mime,size_bytes,sha256,scan_status,created_at) VALUES(?,?,?,?,?,?,'private',?,?,?,?,?, ?,UTC_TIMESTAMP())`,[publicId,request.id,users[0]!.id,role,file.originalname,stored.storedFilename,stored.storagePath,metadata.extension,metadata.mime,metadata.size,metadata.sha256,metadata.scanStatus]);
      if(role==='SOURCE_RESUME'&&request.status==='DRAFT'){await this.pool.execute(`UPDATE resume_requests SET status='SUBMITTED',submitted_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=? AND status='DRAFT'`,[request.id]);await this.pool.execute(`INSERT INTO resume_request_status_logs(request_id,from_status,to_status,changed_by_user_id,reason,created_at) VALUES(?,'DRAFT','SUBMITTED',?,'Source resume uploaded',UTC_TIMESTAMP())`,[request.id,users[0]!.id]);}
      return{publicId,role,originalFilename:file.originalname,sizeBytes:metadata.size,scanStatus:metadata.scanStatus};
    }catch(error){await this.storage.remove(stored.storagePath);throw error;}
  }
  async downloadCurrent(actor:string,requestPublicId:string){
    const [rows]=await this.pool.execute<Array<RowDataPacket&{request_id:number;deliverable_id:number;owner_public_id:string;assigned_public_id:string|null;retention_expires_at:Date|null;original_filename:string;storage_path:string;detected_mime:string;scan_status:string;deleted_at:Date|null}>>(`SELECT r.id request_id,d.id deliverable_id,owner.public_id owner_public_id,specialist.public_id assigned_public_id,r.retention_expires_at,f.original_filename,f.storage_path,f.detected_mime,f.scan_status,f.deleted_at
      FROM resume_requests r JOIN users owner ON owner.id=r.user_id LEFT JOIN users specialist ON specialist.id=r.assigned_specialist_id
      JOIN resume_deliverables d ON d.request_id=r.id AND d.is_current=1 AND d.state='RELEASED' AND d.revoked_at IS NULL
      JOIN resume_request_files f ON f.id=d.file_id WHERE r.public_id=? LIMIT 1`,[requestPublicId]);
    const row=rows[0];if(!row)throw new AppError(404,'RESUME_REQUEST_NOT_FOUND','Released deliverable was not found.');
    if(row.owner_public_id!==actor){const permissions=await this.rbac.permissions(actor);if((row.assigned_public_id!==actor||!permissions.has('resume.assigned.read'))&&!permissions.has('resume.admin')&&!permissions.has('resume.quality_review'))throw new AppError(403,'RESUME_DOWNLOAD_FORBIDDEN','Download is not permitted.');}
    if(row.deleted_at)throw new AppError(410,'RESUME_FILE_DELETED','Resume file has been deleted.');
    if(!row.retention_expires_at||row.retention_expires_at<=new Date())throw new AppError(410,'RESUME_FILE_EXPIRED','Resume file retention has expired.');
    if(!row.scan_status.startsWith('CLEAN'))throw new AppError(422,'RESUME_FILE_UNSAFE','Resume file has not passed validation.');
    const [viewers]=await this.pool.execute<Array<RowDataPacket&{id:number}>>(`SELECT id FROM users WHERE public_id=? AND status='active' LIMIT 1`,[actor]);if(!viewers[0])throw new AppError(401,'AUTH_REQUIRED','Authentication is required.');
    const content=await this.storage.read(row.storage_path);
    await this.pool.execute(`INSERT INTO resume_download_logs(request_id,deliverable_id,user_id,downloaded_at) VALUES(?,?,?,UTC_TIMESTAMP())`,[row.request_id,row.deliverable_id,viewers[0].id]);
    return{content,filename:row.original_filename.replace(/[^a-zA-Z0-9._ -]/g,'_'),mime:row.detected_mime};
  }
  async downloadFile(actor:string,requestPublicId:string,filePublicId:string){
    const [rows]=await this.pool.execute<Array<RowDataPacket&{owner_public_id:string;assigned_public_id:string|null;file_role:string;original_filename:string;storage_path:string;detected_mime:string;scan_status:string}>>(`SELECT owner.public_id owner_public_id,specialist.public_id assigned_public_id,f.file_role,f.original_filename,f.storage_path,f.detected_mime,f.scan_status
      FROM resume_request_files f JOIN resume_requests r ON r.id=f.resume_request_id JOIN users owner ON owner.id=r.user_id LEFT JOIN users specialist ON specialist.id=r.assigned_specialist_id
      WHERE r.public_id=? AND f.public_id=? AND f.deleted_at IS NULL LIMIT 1`,[requestPublicId,filePublicId]);
    const row=rows[0];if(!row)throw new AppError(404,'RESUME_REQUEST_NOT_FOUND','Resume file was not found.');
    const internal=['WORKING_DRAFT','DELIVERABLE'].includes(row.file_role);
    if(row.owner_public_id!==actor||internal){
      const permissions=await this.rbac.permissions(actor);
      if((row.assigned_public_id!==actor||!permissions.has('resume.assigned.read'))&&!permissions.has('resume.admin')&&!permissions.has('resume.quality_review'))throw new AppError(403,'RESUME_DOWNLOAD_FORBIDDEN','Download is not permitted.');
    }
    if(!row.scan_status.startsWith('CLEAN'))throw new AppError(422,'RESUME_FILE_UNSAFE','Resume file has not passed validation.');
    return{content:await this.storage.read(row.storage_path),filename:row.original_filename.replace(/[^a-zA-Z0-9._ -]/g,'_'),mime:row.detected_mime};
  }
}
