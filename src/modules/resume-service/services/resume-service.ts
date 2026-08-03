import { AppError } from '../../../shared/http/errors.ts';
import type { MySqlResumeRepository } from '../repositories/mysql-resume-repository.ts';
import type { ResumeRequestInput } from '../dto/resume-input.ts';

export class ResumeService {
  readonly #repository:MySqlResumeRepository;
  constructor(repository:MySqlResumeRepository){this.#repository=repository;}
  async eligibility(userId:string){
    const value=await this.#repository.eligibility(userId);
    if(!value)throw new AppError(401,'AUTH_REQUIRED','Authentication is required.');
    return value;
  }
  async create(userId:string,input:ResumeRequestInput){
    const result=await this.#repository.create(userId,input);
    if(result==='pro_required')throw new AppError(403,'RESUME_SERVICE_PRO_REQUIRED','An active Pro subscription is required.');
    if(result==='email_unverified')throw new AppError(403,'RESUME_SERVICE_EMAIL_VERIFICATION_REQUIRED','Email verification is required.');
    if(result==='active_exists')throw new AppError(409,'RESUME_SERVICE_ACTIVE_REQUEST_EXISTS','Only one active request is allowed.');
    if(result==='entitlement_used')throw new AppError(409,'RESUME_SERVICE_ENTITLEMENT_USED','The current subscription-period benefit has been used.');
    if(result==='beneficiary_locked')throw new AppError(409,'RESUME_SERVICE_BENEFICIARY_LOCKED','The beneficiary is locked for this subscription period.');
    return result;
  }
  list(userId:string){return this.#repository.listOwned(userId);}
  async detail(userId:string,id:string){
    const result=await this.#repository.ownedDetail(userId,id);
    if(!result)throw new AppError(404,'RESUME_REQUEST_NOT_FOUND','Resume request was not found.');
    const expiry=result.retentionExpiresAt instanceof Date?result.retentionExpiresAt:null;
    const server=result.currentServerTime instanceof Date?result.currentServerTime:new Date();
    return {...result,remainingSeconds:expiry?Math.max(0,Math.floor((expiry.getTime()-server.getTime())/1000)):null,isExpired:Boolean(expiry&&expiry<=server)};
  }
  async revision(userId:string,id:string,notes:string){
    const result=await this.#repository.requestRevision(userId,id,notes);
    if(result==='not_found')throw new AppError(404,'RESUME_REQUEST_NOT_FOUND','Resume request was not found.');
    if(result==='invalid_status')throw new AppError(409,'RESUME_REVISION_NOT_ALLOWED','Revision is not allowed in the current status.');
    if(result==='limit')throw new AppError(409,'RESUME_REVISION_LIMIT_REACHED','Maximum three revisions reached.');
    return result;
  }
  queue(actorPublicId:string,canAccessPool:boolean){return this.#repository.queue(actorPublicId,canAccessPool);}
  operationalDetail(actorPublicId:string,publicId:string,canAccessPool:boolean){return this.#repository.operationalDetail(actorPublicId,publicId,canAccessPool);}
}
