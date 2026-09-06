import type { CpanelSmtpMailer } from '../cpanel-smtp-mailer.ts';
import type { EmailTemplateRepository } from './email-template-repository.ts';
import { dummyValues, renderEmail, type RenderValues, type TemplateKey } from './template-content.ts';

export class EmailTemplateDelivery{
  readonly#repository:Pick<EmailTemplateRepository,'published'>&Partial<Pick<EmailTemplateRepository,'claimTest'|'finishTest'>>;readonly#mailer:CpanelSmtpMailer;readonly#appUrl:string;
  constructor(input:{repository:Pick<EmailTemplateRepository,'published'>&Partial<Pick<EmailTemplateRepository,'claimTest'|'finishTest'>>;mailer:CpanelSmtpMailer;appUrl:string}){this.#repository=input.repository;this.#mailer=input.mailer;this.#appUrl=input.appUrl;}
  async send(key:TemplateKey,email:string,values:RenderValues,version?:number|null){const selected=await this.#repository.published(key,version);const rendered=renderEmail(key,selected.content,values,this.#appUrl);await this.#mailer.sendRendered(email,rendered.subject,rendered.plainText,rendered.html);return selected.version;}
  async workTest():Promise<boolean>{if(!this.#repository.claimTest||!this.#repository.finishTest)return false;const job=await this.#repository.claimTest();if(!job)return false;try{const rendered=renderEmail(job.key,job.content,dummyValues,this.#appUrl,true);await this.#mailer.sendRendered(job.email,rendered.subject,rendered.plainText,rendered.html);await this.#repository.finishTest(job.testId,'sent');}catch{await this.#repository.finishTest(job.testId,'failed','DELIVERY_FAILED');}return true;}
}
