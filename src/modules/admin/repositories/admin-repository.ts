import type{AdminPlanInput,AdminThemeInput}from'../dto/admin-plan-input.ts';
export type AdminPlan=Readonly<{code:string;name:string;price:number;currency:string;durationDays:number;isActive:boolean;features:Record<string,boolean|number|string>}>;
export type AdminPayment=Readonly<{publicId:string;orderId:string;email:string;planCode:string;amount:number;currency:string;status:string;gatewayStatus:string|null;createdAt:Date}>;
export type AdminTheme=Readonly<{code:string;name:string;minimumPlanCode:string;displayOrder:number;isActive:boolean}>;
export type AdminUser=Readonly<{publicId:string;email:string;role:string;status:string;createdAt:Date}>;
export type AdminCard=Readonly<{publicId:string;slug:string;ownerEmail:string|null;planCode:string;status:string;createdAt:Date}>;
export type AdminActivity=Readonly<{event:string;actorEmail:string|null;metadata:string|null;createdAt:Date}>;
export interface AdminRepository{listPlans():Promise<AdminPlan[]>;updatePlan(actorPublicId:string,code:'basic'|'pro',input:AdminPlanInput,now:Date):Promise<AdminPlan|null>;listPayments(limit:number):Promise<AdminPayment[]>;listUsers(limit:number):Promise<AdminUser[]>;listCards(limit:number):Promise<AdminCard[]>;listThemes():Promise<AdminTheme[]>;updateTheme(actorPublicId:string,code:string,input:AdminThemeInput,now:Date):Promise<AdminTheme|null>;listActivity(limit:number):Promise<AdminActivity[]>;}
