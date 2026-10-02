export type CreateGatewayCheckout = Readonly<{
  orderId: string;
  amount: number;
  customer: { email: string; firstName: string };
  item: { id: string; name: string; quantity: 1; price: number };
}>;

export type PaymentProvider = 'duitku';
export type GatewayEnvironment = 'sandbox' | 'production';
export type NormalizedPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'canceled' | 'refunded' | 'partial_refund';
export type GatewayCheckoutResult = Readonly<{ reference: string | null; redirectUrl: string }>;
export type VerifiedGatewayNotification = Readonly<{
  orderId: string;
  statusCode: string;
  grossAmount: string;
  transactionStatus: string;
  status: NormalizedPaymentStatus;
  transactionId: string | null;
  fraudStatus: string | null;
  eventKey: string;
  raw: Record<string, unknown>;
}>;
export type GatewayTransactionStatus = Omit<VerifiedGatewayNotification, 'eventKey'>;

export interface PaymentGatewayPort {
  readonly provider: PaymentProvider;
  readonly environment: GatewayEnvironment;
  readonly merchantCode: string | null;
  createCheckout(input: CreateGatewayCheckout): Promise<GatewayCheckoutResult>;
  verifyNotification(payload: unknown): Promise<VerifiedGatewayNotification>;
  getTransactionStatus(orderId: string): Promise<GatewayTransactionStatus>;
}
