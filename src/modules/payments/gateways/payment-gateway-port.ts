export type CreateGatewayCheckout = Readonly<{
  orderId: string;
  amount: number;
  customer: { email: string; firstName: string };
  item: { id: string; name: string; quantity: 1; price: number };
  callbacks: { finish: string; unfinish: string; error: string };
}>;

export type GatewayCheckoutResult = Readonly<{ token: string; redirectUrl: string }>;
export type VerifiedGatewayNotification = Readonly<{
  orderId: string;
  statusCode: string;
  grossAmount: string;
  transactionStatus: string;
  transactionId: string | null;
  fraudStatus: string | null;
  eventKey: string;
  raw: Record<string, unknown>;
}>;
export type GatewayTransactionStatus = Omit<VerifiedGatewayNotification, 'eventKey'>;

export interface PaymentGatewayPort {
  createCheckout(input: CreateGatewayCheckout): Promise<GatewayCheckoutResult>;
  verifyNotification(payload: unknown): Promise<VerifiedGatewayNotification>;
  getTransactionStatus(orderId: string): Promise<GatewayTransactionStatus>;
}
