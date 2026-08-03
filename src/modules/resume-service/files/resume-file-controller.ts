import type{Request,Response}from'express';
import{z}from'zod';
import{readCookie}from'../../../shared/http/cookie-reader.ts';
import{AppError}from'../../../shared/http/errors.ts';
import type{AuthenticatedActorService}from'../../../shared/security/authenticated-actor.ts';
import type{ResumeFileService}from'./resume-file-service.ts';

const role=z.enum(['SOURCE_RESUME','JOB_DESCRIPTION','SUPPLEMENTAL_INFORMATION','REVISION_SUPPORT','WORKING_DRAFT','DELIVERABLE']);
export class ResumeFileController{
  readonly service:ResumeFileService;readonly actors:AuthenticatedActorService;
  constructor(service:ResumeFileService,actors:AuthenticatedActorService){this.service=service;this.actors=actors;}
  upload=async(req:Request,res:Response)=>{const actor=this.actors.authorizeUnsafe(readCookie(req,'access_token')??undefined,req.header('x-csrf-token')),parsed=role.safeParse(req.body.role);if(!parsed.success||!req.file)throw new AppError(422,'VALIDATION_ERROR','A valid file role and file are required.');res.status(201).json({success:true,message:'Resume file uploaded.',data:await this.service.upload(actor.userPublicId,String(req.params.publicId),parsed.data,req.file)});};
  download=async(req:Request,res:Response)=>{const actor=this.actors.authenticate(readCookie(req,'access_token')??undefined),file=await this.service.downloadCurrent(actor.userPublicId,String(req.params.publicId));res.setHeader('Content-Type',file.mime);res.setHeader('Content-Disposition',`attachment; filename="${file.filename.replace(/"/g,'_')}"`);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.send(file.content);};
  downloadFile=async(req:Request,res:Response)=>{const actor=this.actors.authenticate(readCookie(req,'access_token')??undefined),file=await this.service.downloadFile(actor.userPublicId,String(req.params.publicId),String(req.params.filePublicId));res.setHeader('Content-Type',file.mime);res.setHeader('Content-Disposition',`attachment; filename="${file.filename.replace(/"/g,'_')}"`);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.send(file.content);};
}
