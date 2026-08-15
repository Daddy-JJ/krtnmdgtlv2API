export const mailOutboxStatuses=['queued','processing','sent','failed']as const;
export type MailOutboxStatus=typeof mailOutboxStatuses[number];
export type AdminMailOutboxItem=Readonly<{publicId:string;maskedRecipient:string;templateKey:string;status:MailOutboxStatus;attempts:number;maxAttempts:number;availableAt:Date;sentAt:Date|null;failedAt:Date|null;lastErrorCode:string|null;lastErrorMessage:string|null;createdAt:Date;updatedAt:Date}>;
export type ListAdminMailInput=Readonly<{status?:MailOutboxStatus;limit:number}>;
export interface AdminMailRepository{list(input:ListAdminMailInput):Promise<AdminMailOutboxItem[]>;retry(actorPublicId:string,outboxPublicId:string,reason:string,correlationId:string|null):Promise<AdminMailOutboxItem>;}
