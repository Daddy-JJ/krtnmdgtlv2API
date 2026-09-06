import type{EmailTemplateDelivery}from'./templates/email-template-delivery.ts';
import{keySchema}from'./templates/template-content.ts';
import type{MySqlMailOutboxRepository}from'./mail-outbox-repository.ts';

export class ResumeNotificationMailWorker{
  readonly #outbox:MySqlMailOutboxRepository;
  readonly #delivery:EmailTemplateDelivery;
  readonly #appUrl:string;
  constructor(dependencies:{outbox:MySqlMailOutboxRepository;delivery:EmailTemplateDelivery;appUrl:string}){
    this.#outbox=dependencies.outbox;this.#delivery=dependencies.delivery;this.#appUrl=dependencies.appUrl;
  }
  async runOnce():Promise<boolean>{
    const job=await this.#outbox.claimResume();
    if(!job)return false;
    try{
      const payload=this.#safePayload(job.payloadText);
      const requestUrl=`${this.#appUrl}/app/resume-enhancement/request/?id=${encodeURIComponent(payload.requestPublicId??'')}`;
      const key=keySchema.parse(job.templateKey);
      await this.#delivery.send(key,job.email,{requestUrl,...(payload.retentionExpiresAt?{retentionExpiresAt:payload.retentionExpiresAt}:{})},job.templateVersion);
      await this.#outbox.markSent(job);
      return true;
    }catch{
      await this.#outbox.markFailed(job);
      return false;
    }
  }
  #safePayload(value:string|null):{requestPublicId?:string;retentionExpiresAt?:string}{
    try{const parsed=JSON.parse(value??'{}') as Record<string,unknown>;return{
      ...(typeof parsed.requestPublicId==='string'?{requestPublicId:parsed.requestPublicId}:{}),
      ...(typeof parsed.retentionExpiresAt==='string'?{retentionExpiresAt:parsed.retentionExpiresAt}:{}),
    };}catch{return{};}
  }
}
