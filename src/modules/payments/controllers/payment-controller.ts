import type{Request,Response}from'express';import{z}from'zod';import{readCookie}from'../../../shared/http/cookie-reader.ts';import{AppError}from'../../../shared/http/errors.ts';import type{AuthenticatedActorService}from'../../../shared/security/authenticated-actor.ts';import{checkoutInputSchema}from'../dto/payment-input.ts';import type{PaymentService}from'../services/payment-service.ts';
export class PaymentController {
  readonly #service:PaymentService;readonly #actors:AuthenticatedActorService;
  constructor(service:PaymentService,actors:AuthenticatedActorService){this.#service=service;this.#actors=actors;}
  checkout=async(req:Request,res:Response)=>{
    const actor=this.#actors.authorizeUnsafe(readCookie(req,'access_token')??undefined,req.header('x-csrf-token'));
    const parsed=checkoutInputSchema.safeParse(req.body),key=z.uuid().safeParse(req.header('idempotency-key'));
    if(!parsed.success || !key.success)throw new AppError(422,'VALIDATION_ERROR','A valid plan and UUID Idempotency-Key are required.');
    const data=await this.#service.checkout(actor.userPublicId,parsed.data,key.data);
    res.status(data.status==='pending'&&!data.redirectUrl?202:201).json({success:true,message:data.status==='pending'&&!data.redirectUrl?'Payment checkout is awaiting verification.':'Payment checkout retrieved.',data});
  };
  capabilities=async(req:Request,res:Response)=>{const actor=this.#actors.authenticate(readCookie(req,'access_token')??undefined);res.json({success:true,message:'Payment capabilities retrieved.',data:this.#service.capabilities(actor.userPublicId)});};
  duitkuCallback=async(req:Request,res:Response)=>{await this.#service.duitkuCallback(req.body);res.status(200).type('text/plain').send('OK');};
  reconcile=async(req:Request,res:Response)=>{const actor=this.#actors.authorizeUnsafe(readCookie(req,'access_token')??undefined,req.header('x-csrf-token'));const id=this.#id(req);res.json({success:true,message:'Payment reconciled.',data:await this.#service.reconcile(actor.userPublicId,id)});};
  subscription=async(req:Request,res:Response)=>{const actor=this.#actors.authenticate(readCookie(req,'access_token')??undefined);res.json({success:true,message:'Current subscription retrieved.',data:await this.#service.currentSubscription(actor.userPublicId)});};
  list=async(req:Request,res:Response)=>{const actor=this.#actors.authenticate(readCookie(req,'access_token')??undefined);res.json({success:true,message:'Payments retrieved.',data:await this.#service.list(actor.userPublicId)});};
  get=async(req:Request,res:Response)=>{const actor=this.#actors.authenticate(readCookie(req,'access_token')??undefined);res.json({success:true,message:'Payment retrieved.',data:await this.#service.get(actor.userPublicId,this.#id(req))});};
  #id(req:Request){const id=z.uuid().safeParse(req.params.publicId);if(!id.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');return id.data;}
}
