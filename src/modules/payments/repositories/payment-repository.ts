export type CheckoutAuthority = Readonly<{
  userId: number; email: string; fullName: string; currentPlanCode: 'starter' | 'basic' | 'pro';
  targetPlan: { code: 'basic' | 'pro'; name: string; amount: number; currency: string; durationDays: number };
}>;

export type PaymentRecord = Readonly<{
  publicId: string; merchantOrderId: string; targetPlanCode: string; planName: string; durationDays: number;
  amount: number; currency: string; status: string; gatewayStatus: string | null; redirectUrl: string | null;
  paidAt: Date | null; expiresAt: Date | null; createdAt: Date;
}>;
export type PaymentNotification = Readonly<{ orderId:string;statusCode:string;grossAmount:string;transactionStatus:string;transactionId:string|null;fraudStatus:string|null;eventKey:string }>;
export type NotificationOutcome = Readonly<{ result:'processed'|'duplicate'|'ignored'|'unknown_order'|'amount_mismatch'|'event_conflict';paymentPublicId:string|null;paymentStatus:string|null }>;
export type CurrentSubscription = Readonly<{ publicId:string;planCode:'basic'|'pro';status:string;startsAt:Date;endsAt:Date }>;

export interface PaymentRepository {
  findCheckoutAuthority(userPublicId: string, targetPlanCode: 'basic' | 'pro'): Promise<CheckoutAuthority | null>;
  insertPending(input: { publicId: string; merchantOrderId: string; authority: CheckoutAuthority; now: Date }): Promise<PaymentRecord>;
  attachGatewayCheckout(publicId: string, redirectUrl: string, expiresAt: Date | null, now: Date): Promise<PaymentRecord | null>;
  markCheckoutFailed(publicId: string, now: Date): Promise<void>;
  listOwned(userPublicId: string): Promise<PaymentRecord[]>;
  findOwned(userPublicId: string, publicId: string): Promise<PaymentRecord | null>;
  applyVerifiedNotification(notification:PaymentNotification,payloadHash:string,now:Date):Promise<NotificationOutcome>;
  findCurrentSubscription(userPublicId:string,now:Date):Promise<CurrentSubscription|null>;
}
