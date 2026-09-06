import type { EmailContent, TemplateKey } from './template-content.ts';

export type TemplateSummary = Readonly<{key:TemplateKey;label:string;purpose:string;draftRevision:string;publishedVersion:number|null;updatedAt:Date;updatedBy:string|null}>;
export type TemplateRecord = Readonly<{key:TemplateKey;content:EmailContent;draftRevision:string;publishedVersion:number|null;updatedAt:Date;updatedBy:string|null}>;
export type TemplateVersion = Readonly<{version:number;content:EmailContent;actorPublicId:string;reason:string;createdAt:Date}>;
export type TemplateTest = Readonly<{testId:string;status:'queued'|'processing'|'sent'|'failed';maskedRecipient:string;errorCode:string|null}>;
export type ClaimedTemplateTest = Readonly<{testId:string;key:TemplateKey;email:string;content:EmailContent}>;

export interface EmailTemplateRepository {
  list():Promise<TemplateSummary[]>;
  detail(key:TemplateKey):Promise<TemplateRecord>;
  published(key:TemplateKey,version?:number|null):Promise<{content:EmailContent;version:number|null}>;
  saveDraft(actor:string,key:TemplateKey,expectedRevision:string,content:EmailContent):Promise<TemplateRecord>;
  publish(actor:string,key:TemplateKey,draftRevision:string,expectedVersion:number|null,reason:string,idempotencyKey:string,requestId:string):Promise<{publishedVersion:number;publishedAt:Date}>;
  versions(key:TemplateKey,limit:number,cursor:number|null):Promise<{items:TemplateVersion[];nextCursor:number|null}>;
  version(key:TemplateKey,version:number):Promise<TemplateVersion>;
  restore(actor:string,key:TemplateKey,version:number,expectedRevision:string,reason:string,idempotencyKey:string,requestId:string):Promise<TemplateRecord>;
  enqueueTest(actor:string,key:TemplateKey,draftRevision:string,idempotencyKey:string,requestId:string):Promise<TemplateTest>;
  testStatus(actor:string,key:TemplateKey,testId:string):Promise<TemplateTest>;
  claimTest():Promise<ClaimedTemplateTest|null>;
  finishTest(testId:string,status:'sent'|'failed',errorCode?:string):Promise<void>;
}
