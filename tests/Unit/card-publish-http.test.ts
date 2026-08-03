import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../../src/app.ts';
import { CardController } from '../../src/modules/cards/controllers/card-controller.ts';
import { createCardRouter, createPublicCardRouter } from '../../src/modules/cards/routes/card-router.ts';
import type { CardService } from '../../src/modules/cards/services/card-service.ts';
import { AppError } from '../../src/shared/http/errors.ts';
import type { Logger } from '../../src/shared/logging/logger.ts';
import type { AuthenticatedActorService } from '../../src/shared/security/authenticated-actor.ts';

const id = '7fe91d39-c2a8-4b29-bc1d-b5304c7bfc61';
const card = { publicId:id, slug:'aBcDeFg', planCode:'starter' as const, themeCode:'starter-clean', locale:'id' as const, status:'published', canonicalUrl:'https://kartunamadigital.id/aBcDeFg', qrImageUrl:'/api/v1/public/cards/aBcDeFg/qr', contact:{fullName:'Public',jobTitle:'',organization:'',officePhone:'',mobilePhone:'0812',email:'public@example.com',websiteUrl:'https://example.com',addressText:''} };
const service = { publish:async()=>card, publicCard:async(slug:string)=>{if(slug!=='aBcDeFg')throw new AppError(404,'CARD_NOT_FOUND','Card not found.');return card;} } as unknown as CardService;
const actors = { authenticate:()=>({userPublicId:'user',sessionId:'sid',role:'user' as const}), authorizeUnsafe:(_token:string|undefined,csrf:string|undefined)=>{if(csrf!=='valid')throw new AppError(403,'CSRF_INVALID','CSRF validation failed.');return{userPublicId:'user',sessionId:'sid',role:'user' as const};} } as unknown as AuthenticatedActorService;
const logger:Logger={info:()=>undefined,error:()=>undefined};

async function call(method:string,path:string,headers:Record<string,string>={}){const controller=new CardController(service,actors);const app=createApp({databaseHealth:{check:async()=>({healthy:true,latencyMs:0})},environment:'testing',logger,cardRouter:createCardRouter(controller),publicCardRouter:createPublicCardRouter(controller)});const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));try{return await fetch(`http://127.0.0.1:${(server.address()as AddressInfo).port}${path}`,{method,headers:{cookie:'access_token=value',...headers}});}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}}

test('publish requires session-bound CSRF',async()=>{assert.equal((await call('POST',`/api/v1/cards/${id}/publish`)).status,403);assert.equal((await call('POST',`/api/v1/cards/${id}/publish`,{'x-csrf-token':'valid'})).status,200);});
test('published card is public without auth and Starter slug remains case-sensitive',async()=>{assert.equal((await call('GET','/api/v1/public/cards/aBcDeFg')).status,200);assert.equal((await call('GET','/api/v1/public/cards/abcdefg')).status,404);});
