import type { RateLimiter } from '../../auth/repositories/auth-repository.ts';
import type { EmailTemplateRepository } from '../../email/templates/email-template-repository.ts';
import { definition, dummyValues, limits, renderEmail, validateContent, type TemplateKey } from '../../email/templates/template-content.ts';
import type { RbacService } from '../../../shared/security/rbac-service.ts';
import { AppError } from '../../../shared/http/errors.ts';

export class EmailTemplateAdminService{
  readonly#repository:EmailTemplateRepository;readonly#rbac:RbacService;readonly#rateLimiter:RateLimiter;readonly#appUrl:string;
  constructor(input:{repository:EmailTemplateRepository;rbac:RbacService;rateLimiter:RateLimiter;appUrl:string}){this.#repository=input.repository;this.#rbac=input.rbac;this.#rateLimiter=input.rateLimiter;this.#appUrl=input.appUrl;}
  async list(actor:string){await this.#read(actor);return this.#repository.list();}
  async detail(actor:string,key:TemplateKey){await this.#read(actor);const value=await this.#repository.detail(key);return{...value,...definition(key),assets:[{key:'brand',label:'Logo KartuNamaDigital'}],limits};}
  async save(actor:string,key:TemplateKey,expectedRevision:string,content:unknown){await this.#write(actor);return this.#repository.saveDraft(actor,key,expectedRevision,validateContent(key,content,false));}
  async preview(actor:string,key:TemplateKey,draftRevision:string){await this.#read(actor);const draft=await this.#repository.detail(key);if(draft.draftRevision!==draftRevision)throw conflict();const rendered=renderEmail(key,draft.content,dummyValues,this.#appUrl,true);return{draftRevision,subject:rendered.subject,plainText:rendered.plainText,document:rendered.document,warnings:[]};}
  async testSend(actor:string,sessionId:string,key:TemplateKey,draftRevision:string,idempotencyKey:string,requestId:string){await this.#sensitive(actor,sessionId);if(!await this.#rateLimiter.consume('email-template-test',actor,10,3600))throw rateLimited();const draft=await this.#repository.detail(key);validateContent(key,draft.content);return this.#repository.enqueueTest(actor,key,draftRevision,idempotencyKey,requestId);}
  async testStatus(actor:string,key:TemplateKey,testId:string){await this.#read(actor);return this.#repository.testStatus(actor,key,testId);}
  async publish(actor:string,sessionId:string,key:TemplateKey,draftRevision:string,expectedPublishedVersion:number|null,reason:string,idempotencyKey:string,requestId:string){await this.#sensitive(actor,sessionId);const draft=await this.#repository.detail(key);if(draft.draftRevision!==draftRevision)throw conflict();validateContent(key,draft.content);return this.#repository.publish(actor,key,draftRevision,expectedPublishedVersion,reason,idempotencyKey,requestId);}
  async versions(actor:string,key:TemplateKey,limit:number,cursor:number|null){await this.#read(actor);return this.#repository.versions(key,limit,cursor);}
  async version(actor:string,key:TemplateKey,value:number){await this.#read(actor);return this.#repository.version(key,value);}
  async restore(actor:string,sessionId:string,key:TemplateKey,value:number,expectedRevision:string,reason:string,idempotencyKey:string,requestId:string){await this.#sensitive(actor,sessionId);return this.#repository.restore(actor,key,value,expectedRevision,reason,idempotencyKey,requestId);}
  async #read(actor:string){await this.#rbac.assert(actor,'settings.manage');}
  async #write(actor:string){await this.#rbac.assert(actor,'settings.manage');}
  async #sensitive(actor:string,sessionId:string){await this.#write(actor);await this.#rbac.assertRecentSession(actor,sessionId);}
}
const conflict=()=>new AppError(409,'EMAIL_TEMPLATE_CONFLICT','Template berubah di sesi lain.');
const rateLimited=()=>new AppError(429,'RATE_LIMITED','Terlalu banyak email uji.');
