import { createHash, timingSafeEqual } from 'node:crypto';
import Midtrans from 'midtrans-client';
import { AppError } from '../../../shared/http/errors.ts';
import { midtransNotificationSchema } from '../dto/payment-input.ts';
import type { CreateGatewayCheckout, GatewayCheckoutResult, GatewayTransactionStatus, PaymentGatewayPort, VerifiedGatewayNotification } from './payment-gateway-port.ts';

type SnapClient = InstanceType<typeof Midtrans.Snap>;
type NotificationValue = Record<string, unknown> & { order_id: string; status_code: string; gross_amount: string; transaction_status: string; transaction_id?: string | undefined; fraud_status?: string | undefined };

export class MidtransGateway implements PaymentGatewayPort {
  readonly #snap: SnapClient;
  readonly #serverKey: string;

  constructor(config: { environment: 'sandbox' | 'production'; serverKey: string; clientKey: string }, snap?: SnapClient) {
    if (!config.serverKey || !config.clientKey) throw new AppError(500, 'PAYMENT_CONFIG_INVALID', 'Payment configuration is invalid.');
    this.#serverKey = config.serverKey;
    this.#snap = snap ?? new Midtrans.Snap({ isProduction: config.environment === 'production', serverKey: config.serverKey, clientKey: config.clientKey });
  }

  async createCheckout(input: CreateGatewayCheckout): Promise<GatewayCheckoutResult> {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount !== input.item.price) throw new AppError(500, 'PAYMENT_AMOUNT_INVALID', 'Payment amount is invalid.');
    const response = await this.#snap.createTransaction({
      transaction_details: { order_id: input.orderId, gross_amount: input.amount },
      item_details: [{ id: input.item.id, price: input.item.price, quantity: input.item.quantity, name: input.item.name }],
      customer_details: { email: input.customer.email, first_name: input.customer.firstName },
      callbacks: { finish: input.callbacks.finish, unfinish: input.callbacks.unfinish, error: input.callbacks.error },
    });
    if (typeof response.token !== 'string' || response.token === '' || typeof response.redirect_url !== 'string' || !URL.canParse(response.redirect_url)) throw new AppError(502, 'PAYMENT_GATEWAY_INVALID_RESPONSE', 'Payment gateway returned an invalid response.');
    return { token: response.token, redirectUrl: response.redirect_url };
  }

  async verifyNotification(payload: unknown): Promise<VerifiedGatewayNotification> {
    const parsed = midtransNotificationSchema.safeParse(payload);
    if (!parsed.success) throw new AppError(400, 'PAYMENT_NOTIFICATION_INVALID', 'Payment notification is invalid.');
    const value = parsed.data;
    const expected = createHash('sha512').update(`${value.order_id}${value.status_code}${value.gross_amount}${this.#serverKey}`).digest('hex');
    const supplied = value.signature_key.toLowerCase();
    if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))) throw new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Payment notification signature is invalid.');
    return this.#notification(value);
  }

  async getTransactionStatus(orderId: string): Promise<GatewayTransactionStatus> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(orderId)) throw new AppError(422, 'PAYMENT_ORDER_INVALID', 'Payment order is invalid.');
    const raw = await this.#snap.transaction.status(orderId);
    const parsed = midtransNotificationSchema.omit({ signature_key: true }).safeParse(raw);
    if (!parsed.success) throw new AppError(502, 'PAYMENT_GATEWAY_INVALID_RESPONSE', 'Payment gateway returned an invalid response.');
    const verified = this.#notification({ ...parsed.data, signature_key: '' });
    const { eventKey: _eventKey, ...status } = verified;
    return status;
  }

  #notification(value: NotificationValue): VerifiedGatewayNotification {
    const transactionId = value.transaction_id ?? null;
    const { signature_key: _signature, ...sanitized } = value;
    return {
      orderId: value.order_id, statusCode: value.status_code, grossAmount: value.gross_amount,
      transactionStatus: value.transaction_status, transactionId, fraudStatus: value.fraud_status ?? null,
      eventKey: createHash('sha256').update(`${value.order_id}|${transactionId ?? ''}|${value.status_code}|${value.transaction_status}`).digest('hex'),
      raw: sanitized,
    };
  }
}
