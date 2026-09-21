import{createHash}from'node:crypto';
import{extname}from'node:path';
import{AppError}from'../../../shared/http/errors.ts';
import { validateDocxContainer } from './docx-container.ts';

export type ResumeFileRole='SOURCE_RESUME'|'JOB_DESCRIPTION'|'SUPPLEMENTAL_INFORMATION'|'REVISION_SUPPORT'|'WORKING_DRAFT'|'DELIVERABLE';
const limits:Record<ResumeFileRole,number>={SOURCE_RESUME:10,JOB_DESCRIPTION:3,SUPPLEMENTAL_INFORMATION:5,REVISION_SUPPORT:5,WORKING_DRAFT:10,DELIVERABLE:10};

export function validateResumeFile(role:ResumeFileRole,name:string,content:Buffer){
  if(!content.length||content.length>limits[role]*1024*1024)throw new AppError(413,'RESUME_FILE_TOO_LARGE','Resume file exceeds its size limit.');
  const extension=extname(name).toLowerCase();
  const allowed=role==='DELIVERABLE'||role==='WORKING_DRAFT'?['.docx']:role==='JOB_DESCRIPTION'?['.docx','.pdf','.txt']:['.docx','.pdf'];
  if(!allowed.includes(extension)||extension==='.docm')throw new AppError(422,role==='DELIVERABLE'?'RESUME_OUTPUT_MUST_BE_DOCX':'RESUME_FILE_TYPE_NOT_ALLOWED','Resume file type is not allowed.');
  let mime:string;
  if(extension==='.pdf'){
    if(content.subarray(0,5).toString()!=='%PDF-')throw new AppError(422,'RESUME_FILE_MIME_MISMATCH','File content does not match its extension.');
    mime='application/pdf';
  }else if(extension==='.txt'){
    if(content.includes(0))throw new AppError(422,'RESUME_FILE_UNSAFE','Text file contains binary content.');
    mime='text/plain';
  }else{
    validateDocxContainer(content);
    mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if(content.toString('ascii').includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'))throw new AppError(422,'RESUME_FILE_UNSAFE','Malware scan rejected the file.');
  return{extension:extension.slice(1),mime,size:content.length,sha256:createHash('sha256').update(content).digest('hex'),scanStatus:'PENDING_SCAN'};
}
