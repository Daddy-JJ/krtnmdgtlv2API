import type { Request, Response } from 'express';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import { AppError } from '../../../shared/http/errors.ts';
import type { AuthenticatedActorService } from '../../../shared/security/authenticated-actor.ts';
import type { RbacService } from '../../../shared/security/rbac-service.ts';
import { adminPlanInputSchema, adminThemeInputSchema } from '../dto/admin-plan-input.ts';
import type { AdminService } from '../services/admin-service.ts';

export class AdminController {
  readonly #service: AdminService; readonly #actors: AuthenticatedActorService; readonly #rbac: RbacService;
  constructor(service: AdminService, actors: AuthenticatedActorService, rbac: RbacService) { this.#service=service; this.#actors=actors; this.#rbac=rbac; }
  plans=async(req:Request,res:Response)=>{const actor=this.#authenticate(req,false);await this.#rbac.assert(actor.userPublicId,'settings.read');res.json({success:true,message:'Plans retrieved.',data:await this.#service.listPlans()});};
  payments=async(req:Request,res:Response)=>{const actor=this.#authenticate(req,false);await this.#rbac.assert(actor.userPublicId,'payments.read');res.json({success:true,message:'Payments retrieved.',data:await this.#service.listPayments()});};
  users=async(req:Request,res:Response)=>{const actor=this.#authenticate(req,false);await this.#rbac.assert(actor.userPublicId,'users.read');res.json({success:true,message:'Users retrieved.',data:await this.#service.listUsers()});};
  cards=async(req:Request,res:Response)=>{const actor=this.#authenticate(req,false);await this.#rbac.assert(actor.userPublicId,'users.read');res.json({success:true,message:'Cards retrieved.',data:await this.#service.listCards()});};
  themes=async(req:Request,res:Response)=>{const actor=this.#authenticate(req,false);await this.#rbac.assert(actor.userPublicId,'settings.read');res.json({success:true,message:'Themes retrieved.',data:await this.#service.listThemes()});};
  activity=async(req:Request,res:Response)=>{const actor=this.#authenticate(req,false);await this.#rbac.assert(actor.userPublicId,'audit.read');res.json({success:true,message:'Activity retrieved.',data:await this.#service.listActivity()});};
  updatePlan=async(req:Request,res:Response)=>{const actor=this.#authenticate(req,true);await this.#rbac.assert(actor.userPublicId,'settings.manage');const parsed=adminPlanInputSchema.safeParse(req.body);if(!parsed.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');res.json({success:true,message:'Plan updated.',data:await this.#service.updatePlan(actor.userPublicId,String(req.params.code??''),parsed.data)});};
  updateTheme=async(req:Request,res:Response)=>{const actor=this.#authenticate(req,true);await this.#rbac.assert(actor.userPublicId,'settings.manage');const parsed=adminThemeInputSchema.safeParse(req.body);if(!parsed.success)throw new AppError(422,'VALIDATION_ERROR','Validation failed.');res.json({success:true,message:'Theme updated.',data:await this.#service.updateTheme(actor.userPublicId,String(req.params.code??''),parsed.data)});};
  #authenticate(req:Request,unsafe:boolean){const token=readCookie(req,'access_token')??undefined;return unsafe?this.#actors.authorizeUnsafe(token,req.header('x-csrf-token')):this.#actors.authenticate(token);}
}
