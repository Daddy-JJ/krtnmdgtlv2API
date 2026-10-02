import type { GatewayEnvironment, PaymentProvider, VerifiedGatewayNotification } from '../gateways/payment-gateway-port.ts';

export type CheckoutAuthority = Readonly<{
  userId: number; email: string; fullName: string; currentPlanCode: 'starter' | 'basic' | 'pro';
  targetPlan: { code: 'basic' | 'pro'; name: string; amount: number; currency: string; durationDays: number };
}>;

export type PaymentRecord = Readonly<{
  publicId: string; merchantOrderId: string; targetPlanCode: string; planName: string; durationDays: number;
  amount: number; currency: string; status: string; gatewayStatus: string | null; redirectUrl: string | null;
  paidAt: Date | null; expiresAt: Date | null; createdAt: Date;
  provider: string; environment: GatewayEnvironment | null; merchantCode: string | null;
  reference: string | null; invoiceState: string;
}>;
export type PaymentNotification = Omit<VerifiedGatewayNotification,'raw'> & { provider:PaymentProvider; environment:GatewayEnvironment; merchantCode:string|null };
export type NotificationOutcome = Readonly<{ result:'processed'|'duplicate'|'ignored'|'unknown_order'|'amount_mismatch'|'event_conflict'|'provider_mismatch'|'reference_mismatch';paymentPublicId:string|null;paymentStatus:string|null }>;
export type CurrentSubscription = Readonly<{ publicId:string;planCode:'basic'|'pro';status:string;startsAt:Date;endsAt:Date }>;

export interface PaymentRepository {
  reserveCheckout(input: { userPublicId:string;planCode:'basic'|'pro';provider:PaymentProvider;environment:GatewayEnvironment;merchantCode:string|null;keyHash:string;requestHash:string;publicId:string;orderId:string;expiryMinutes:number;now:Date }): Promise<{ payment:PaymentRecord;authority:CheckoutAuthority|null;created:boolean }>;
  attachInvoice(publicId:string,reference:string|null,redirectUrl:string,now:Date):Promise<PaymentRecord>;
  markCheckoutUncertain(publicId:string,now:Date):Promise<void>;
  findByOrder(orderId:string):Promise<PaymentRecord|null>;
  claimStatusCheck(publicId:string,now:Date):Promise<boolean>;
  findCheckoutAuthority(userPublicId: string, targetPlanCode: 'basic' | 'pro'): Promise<CheckoutAuthority | null>;
  listOwned(userPublicId: string): Promise<PaymentRecord[]>;
  findOwned(userPublicId: string, publicId: string): Promise<PaymentRecord | null>;
  applyVerifiedNotification(notification:PaymentNotification,payloadHash:string,now:Date):Promise<NotificationOutcome>;
  findCurrentSubscription(userPublicId:string,now:Date):Promise<CurrentSubscription|null>;
}
