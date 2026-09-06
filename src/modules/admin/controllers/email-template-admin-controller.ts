import type { Request, Response } from 'express';
import { z } from 'zod';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import { AppError } from '../../../shared/http/errors.ts';
import type { AuthenticatedActor, AuthenticatedActorService } from '../../../shared/security/authenticated-actor.ts';
import { normalizeRole } from '../../../shared/security/roles.ts';
import { contentSchema, keySchema } from '../../email/templates/template-content.ts';
import type { EmailTemplateAdminService } from '../services/email-template-admin-service.ts';

const revision=z.string().uuid(),id=z.string().uuid(),reason=z.string().trim().min(10).max(1000);
const draftBody=z.object({expectedRevision:revision,content:contentSchema}).strict();
const previewBody=z.object({draftRevision:revision}).strict();
const testBody=z.object({draftRevision:revision,confirm:z.literal(true)}).strict();
const publishBody=z.object({draftRevision:revision,expectedPublishedVersion:z.number().int().positive().nullable(),reason,confirm:z.literal(true)}).strict();
const restoreBody=z.object({version:z.number().int().positive(),expectedRevision:revision,reason,confirm:z.literal(true)}).strict();
const page=z.object({limit:z.coerce.number().int().min(1).max(100).default(20),cursor:z.coerce.number().int().positive().optional()}).strict();

export class EmailTemplateAdminController{
  readonly#service:EmailTemplateAdminService;readonly#actors:AuthenticatedActorService;
  constructor(service:EmailTemplateAdminService,actors:AuthenticatedActorService){this.#service=service;this.#actors=actors;}
  list=async(req:Request,res:Response)=>{const a=this.#actor(req);res.json(ok('Template email tersedia.',await this.#service.list(a.userPublicId)));};
  detail=async(req:Request,res:Response)=>{const a=this.#actor(req);res.json(ok('Template email dimuat.',await this.#service.detail(a.userPublicId,this.#key(req))));};
  save=async(req:Request,res:Response)=>{const a=this.#unsafe(req),body=parse(draftBody,req.body);res.json(ok('Draft template tersimpan.',await this.#service.save(a.userPublicId,this.#key(req),body.expectedRevision,body.content)));};
  preview=async(req:Request,res:Response)=>{const a=this.#unsafe(req),body=parse(previewBody,req.body);res.json(ok('Pratinjau template dibuat.',await this.#service.preview(a.userPublicId,this.#key(req),body.draftRevision)));};
  testSend=async(req:Request,res:Response)=>{const a=this.#unsafe(req),body=parse(testBody,req.body);res.status(202).json(ok('Email uji masuk antrean.',await this.#service.testSend(a.userPublicId,a.sessionId,this.#key(req),body.draftRevision,this.#idempotency(req),String(res.locals.requestId??''))));};
  testStatus=async(req:Request,res:Response)=>{const a=this.#actor(req),testId=parse(id,String(req.params.testId??''));res.json(ok('Status email uji dimuat.',await this.#service.testStatus(a.userPublicId,this.#key(req),testId)));};
  publish=async(req:Request,res:Response)=>{const a=this.#unsafe(req),body=parse(publishBody,req.body);res.json(ok('Template dipublikasikan untuk event berikutnya.',await this.#service.publish(a.userPublicId,a.sessionId,this.#key(req),body.draftRevision,body.expectedPublishedVersion,body.reason,this.#idempotency(req),String(res.locals.requestId??''))));};
  versions=async(req:Request,res:Response)=>{const a=this.#actor(req),query=parse(page,req.query);res.json(ok('Riwayat template dimuat.',await this.#service.versions(a.userPublicId,this.#key(req),query.limit,query.cursor??null)));};
  version=async(req:Request,res:Response)=>{const a=this.#actor(req),value=parse(z.coerce.number().int().positive(),String(req.params.version??''));res.json(ok('Versi template dimuat.',await this.#service.version(a.userPublicId,this.#key(req),value)));};
  restore=async(req:Request,res:Response)=>{const a=this.#unsafe(req),body=parse(restoreBody,req.body);res.json(ok('Versi disalin menjadi draft baru.',await this.#service.restore(a.userPublicId,a.sessionId,this.#key(req),body.version,body.expectedRevision,body.reason,this.#idempotency(req),String(res.locals.requestId??''))));};
  #actor(req:Request){const a=this.#actors.authenticate(readCookie(req,'access_token')??undefined);return this.#super(a);}
  #unsafe(req:Request){const a=this.#actors.authorizeUnsafe(readCookie(req,'access_token')??undefined,req.header('x-csrf-token'));return this.#super(a);}
  #super(a:AuthenticatedActor){if(normalizeRole(a.role)!=='super_admin')throw new AppError(403,'SUPER_ADMIN_REQUIRED','Akses Super Admin diperlukan.');return a;}
  #key(req:Request){return parse(keySchema,String(req.params.key??''));}
  #idempotency(req:Request){return parse(id,req.header('idempotency-key'));}
}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const parsed=schema.safeParse(value);if(!parsed.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.',parsed.error.issues.map(i=>({path:i.path.join('.'),message:i.message})));return parsed.data;}
const ok=(message:string,data:unknown)=>({success:true,message,data});
