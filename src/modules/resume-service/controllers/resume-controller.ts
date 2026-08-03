import type{Request,Response}from'express';
import{z}from'zod';
import{readCookie}from'../../../shared/http/cookie-reader.ts';
import{AppError}from'../../../shared/http/errors.ts';
import type{AuthenticatedActorService}from'../../../shared/security/authenticated-actor.ts';
import type{RbacService}from'../../../shared/security/rbac-service.ts';
import{resumeRequestInput,resumeRevisionInput}from'../dto/resume-input.ts';
import type{ResumeService}from'../services/resume-service.ts';

export class ResumeController{
  readonly service:ResumeService;readonly actors:AuthenticatedActorService;readonly rbac:RbacService;
  constructor(service:ResumeService,actors:AuthenticatedActorService,rbac:RbacService){this.service=service;this.actors=actors;this.rbac=rbac;}
  eligibility=async(req:Request,res:Response)=>{const actor=this.#actor(req,false);res.json({success:true,message:'Resume eligibility retrieved.',data:await this.service.eligibility(actor.userPublicId)});};
  list=async(req:Request,res:Response)=>{const actor=this.#actor(req,false);res.json({success:true,message:'Resume requests retrieved.',data:await this.service.list(actor.userPublicId)});};
  create=async(req:Request,res:Response)=>{const actor=this.#actor(req,true),parsed=resumeRequestInput.safeParse(req.body);if(!parsed.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');res.status(201).json({success:true,message:'Resume request submitted.',data:await this.service.create(actor.userPublicId,parsed.data)});};
  detail=async(req:Request,res:Response)=>{const actor=this.#actor(req,false);res.json({success:true,message:'Resume request retrieved.',data:await this.service.detail(actor.userPublicId,this.#id(req))});};
  revision=async(req:Request,res:Response)=>{const actor=this.#actor(req,true),parsed=resumeRevisionInput.safeParse(req.body);if(!parsed.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');res.status(201).json({success:true,message:'Revision requested.',data:await this.service.revision(actor.userPublicId,this.#id(req),parsed.data.notes)});};
  adminQueue=async(req:Request,res:Response)=>{const actor=this.#actor(req,false),permissions=await this.rbac.permissions(actor.userPublicId);if(!permissions.has('resume.pool')&&!permissions.has('resume.assigned.read'))throw new AppError(403,'PERMISSION_REQUIRED','Resume queue permission is required.');res.json({success:true,message:'Resume queue retrieved.',data:await this.service.queue(actor.userPublicId,permissions.has('resume.pool'))});};
  adminDetail=async(req:Request,res:Response)=>{const actor=this.#actor(req,false),permissions=await this.rbac.permissions(actor.userPublicId);if(!permissions.has('resume.pool')&&!permissions.has('resume.assigned.read'))throw new AppError(403,'PERMISSION_REQUIRED','Resume request permission is required.');const data=await this.service.operationalDetail(actor.userPublicId,this.#id(req),permissions.has('resume.pool'));if(!data)throw new AppError(404,'RESUME_REQUEST_NOT_FOUND','Resume request was not found.');res.json({success:true,message:'Resume operational workspace retrieved.',data});};
  #actor(req:Request,unsafe:boolean){return unsafe?this.actors.authorizeUnsafe(readCookie(req,'access_token')??undefined,req.header('x-csrf-token')):this.actors.authenticate(readCookie(req,'access_token')??undefined);}
  #id(req:Request){const value=z.uuid().safeParse(req.params.publicId);if(!value.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');return value.data;}
}
