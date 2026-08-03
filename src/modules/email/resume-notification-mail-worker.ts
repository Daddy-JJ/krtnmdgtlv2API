import type{CpanelSmtpMailer}from'./cpanel-smtp-mailer.ts';
import type{MySqlMailOutboxRepository}from'./mail-outbox-repository.ts';

export class ResumeNotificationMailWorker{
  readonly #outbox:MySqlMailOutboxRepository;
  readonly #mailer:CpanelSmtpMailer;
  readonly #appUrl:string;
  constructor(dependencies:{outbox:MySqlMailOutboxRepository;mailer:CpanelSmtpMailer;appUrl:string}){
    this.#outbox=dependencies.outbox;this.#mailer=dependencies.mailer;this.#appUrl=dependencies.appUrl;
  }
  async runOnce():Promise<boolean>{
    const job=await this.#outbox.claimResume();
    if(!job)return false;
    try{
      const payload=this.#safePayload(job.payloadText);
      const requestUrl=`${this.#appUrl}/app/resume-enhancement/request/?id=${encodeURIComponent(payload.requestPublicId??'')}`;
      const expiry=payload.retentionExpiresAt?new Date(payload.retentionExpiresAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):null;
      const text=job.templateKey==='resume.completed'
        ?`Resume Enhancement Anda sudah siap. Unduh melalui member area: ${requestUrl}${expiry?`\nTersedia sampai ${expiry}.`:''}`
        :`Masa unduh Resume Enhancement Anda segera berakhir${expiry?` pada ${expiry}`:''}. Segera unduh melalui member area: ${requestUrl}`;
      await this.#mailer.sendNotification(job.email,job.subject,text);
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
