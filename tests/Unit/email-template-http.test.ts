import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { AdminController } from '../../src/modules/admin/controllers/admin-controller.ts';
import { EmailTemplateAdminController } from '../../src/modules/admin/controllers/email-template-admin-controller.ts';
import { createAdminRouter } from '../../src/modules/admin/routes/admin-router.ts';
import type { AdminService } from '../../src/modules/admin/services/admin-service.ts';
import type { EmailTemplateAdminService } from '../../src/modules/admin/services/email-template-admin-service.ts';
import { defaults } from '../../src/modules/email/templates/template-content.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { AuthenticatedActorService } from '../../src/shared/security/authenticated-actor.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';

let role='super_admin',saved=0;
const actors={
  authenticate:()=>({userPublicId:'actor',sessionId:'session',role}),
  authorizeUnsafe:(_token:string|undefined,csrf:string|undefined)=>{if(csrf!=='valid')throw new AppError(403,'CSRF_INVALID','CSRF invalid.');return{userPublicId:'actor',sessionId:'session',role};},
}as unknown as AuthenticatedActorService;
const templates={
  list:async()=>[],detail:async()=>({}),save:async()=>{saved++;return{}},preview:async()=>({}),testSend:async()=>({testId:'x'}),testStatus:async()=>({}),publish:async()=>({}),versions:async()=>({items:[]}),version:async()=>({}),restore:async()=>({}),
}as unknown as EmailTemplateAdminService;
const adminService={listPlans:async()=>[],listPayments:async()=>[],listUsers:async()=>[],listCards:async()=>[],listThemes:async()=>[],listActivity:async()=>[]}as unknown as AdminService;
const rbac={assert:async()=>undefined}as never;
const logger:Logger={info:()=>undefined,error:()=>undefined};
async function call(method:string,path:string,body?:unknown,csrf?:string,idempotency?:string){const controller=new EmailTemplateAdminController(templates,actors);const app=createApp({databaseHealth:{check:async()=>({healthy:true,latencyMs:0})},environment:'testing',logger,adminRouter:createAdminRouter(new AdminController(adminService,actors,rbac),undefined,undefined,controller)});const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));try{return await fetch(`http://127.0.0.1:${(server.address()as AddressInfo).port}${path}`,{method,headers:{cookie:'access_token=x',...(csrf?{'x-csrf-token':csrf}:{}),...(idempotency?{'idempotency-key':idempotency}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}}

test('email template catalog is restricted to super_admin',async()=>{role='member';assert.equal((await call('GET','/api/v1/admin/mail/templates')).status,403);role='super_admin';assert.equal((await call('GET','/api/v1/admin/mail/templates')).status,200);});
test('draft mutation requires CSRF and strict content input',async()=>{role='super_admin';saved=0;const body={expectedRevision:'00000000-0000-4000-8000-000000000001',content:defaults('starter.management')};assert.equal((await call('PUT','/api/v1/admin/mail/templates/starter.management/draft',body)).status,403);assert.equal((await call('PUT','/api/v1/admin/mail/templates/starter.management/draft',{...body,unexpected:true},'valid')).status,422);assert.equal((await call('PUT','/api/v1/admin/mail/templates/starter.management/draft',body,'valid')).status,200);assert.equal(saved,1);});
test('test send requires confirmation and UUID idempotency key',async()=>{const body={draftRevision:'00000000-0000-4000-8000-000000000001',confirm:true};assert.equal((await call('POST','/api/v1/admin/mail/templates/starter.management/test-send',body,'valid')).status,422);assert.equal((await call('POST','/api/v1/admin/mail/templates/starter.management/test-send',body,'valid','00000000-0000-4000-8000-000000000002')).status,202);});
