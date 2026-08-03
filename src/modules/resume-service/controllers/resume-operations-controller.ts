import type{Request,Response}from'express';import{z}from'zod';
import{readCookie}from'../../../shared/http/cookie-reader.ts';import{AppError}from'../../../shared/http/errors.ts';
import type{AuthenticatedActorService}from'../../../shared/security/authenticated-actor.ts';
import{resumeAssignInput,resumeTransitionInput}from'../dto/resume-input.ts';import type{ResumeOperationsService}from'../services/resume-operations-service.ts';
const deliverable=z.object({filePublicId:z.uuid(),releaseNotes:z.string().trim().min(1).max(2000),internalNotes:z.string().trim().max(5000).optional().nullable()}).strict();
const release=z.object({deliverablePublicId:z.uuid(),checks:z.object({beneficiaryCorrect:z.literal(true),factualIntegrityChecked:z.literal(true),spellingFormattingChecked:z.literal(true),fileOpens:z.literal(true),noMacros:z.literal(true),noTrackedChangesComments:z.literal(true),noPlaceholders:z.literal(true),readyForRelease:z.literal(true)}),notes:z.string().trim().max(5000).optional()}).strict();
export class ResumeOperationsController{
  readonly service:ResumeOperationsService;readonly actors:AuthenticatedActorService;
  constructor(service:ResumeOperationsService,actors:AuthenticatedActorService){this.service=service;this.actors=actors;}
  assign=async(req:Request,res:Response)=>{const a=this.#actor(req),p=resumeAssignInput.safeParse(req.body);if(!p.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');res.json({success:true,message:'Resume request assigned.',data:await this.service.assign(a.userPublicId,String(req.params.publicId),p.data.specialistPublicId,p.data.reason)});};
  transition=(target:string)=>async(req:Request,res:Response)=>{const a=this.#actor(req),p=resumeTransitionInput.safeParse(req.body);if(!p.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');res.json({success:true,message:'Resume status updated.',data:await this.service.transition(a.userPublicId,String(req.params.publicId),target,p.data.reason)});};
  deliverable=async(req:Request,res:Response)=>{const a=this.#actor(req),p=deliverable.safeParse(req.body);if(!p.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');res.status(201).json({success:true,message:'Deliverable candidate registered.',data:await this.service.registerDeliverable(a.userPublicId,String(req.params.publicId),p.data.filePublicId,p.data.releaseNotes,p.data.internalNotes??null)});};
  release=async(req:Request,res:Response)=>{const a=this.#actor(req),p=release.safeParse(req.body);if(!p.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');res.json({success:true,message:'Resume completed and released.',data:await this.service.release(a.userPublicId,String(req.params.publicId),p.data.deliverablePublicId,p.data.checks,p.data.notes)});};
  #actor(req:Request){return this.actors.authorizeUnsafe(readCookie(req,'access_token')??undefined,req.header('x-csrf-token'));}
}
