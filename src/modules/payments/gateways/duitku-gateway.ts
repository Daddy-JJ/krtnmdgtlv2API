import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../shared/http/errors.ts';
import { jsonLogger, type Logger } from '../../../shared/logging/logger.ts';
import type { CreateGatewayCheckout, GatewayCheckoutResult, GatewayEnvironment, GatewayTransactionStatus, PaymentGatewayPort, VerifiedGatewayNotification } from './payment-gateway-port.ts';

const order = z.string().regex(/^[A-Za-z0-9_-]{1,50}$/);
const reference = z.string().regex(/^[A-Za-z0-9_-]{1,150}$/);
const amount = z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.00)?$/).refine(v => Number.isSafeInteger(Number(v)) && Number(v) > 0);
export const duitkuCallbackSchema = z.object({
  merchantCode: z.string().regex(/^[A-Za-z0-9_-]{1,50}$/), merchantOrderId: order,
  amount, reference, resultCode: z.enum(['00','01']), signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
}).catchall(z.string().max(1000)).refine(v => Object.keys(v).length <= 40);
const statusSchema = z.object({ merchantOrderId: order, reference, amount, statusCode: z.enum(['00','01','02']) });
const invoiceSchema = z.object({ merchantCode: z.string(), reference, paymentUrl: z.string().max(500), statusCode: z.literal('00') });

export function validateDuitkuRedirect(url: string, environment: GatewayEnvironment, expectedReference?: string): string {
  try {
    const value = new URL(url);
    const host = environment === 'sandbox' ? 'app-sandbox.duitku.com' : 'app-prod.duitku.com';
    if (value.protocol !== 'https:' || value.hostname !== host || value.port || value.username || value.password || value.hash
      || value.pathname !== '/redirect_checkout' || value.searchParams.getAll('reference').length !== 1
      || !reference.safeParse(value.searchParams.get('reference')).success
      || [...value.searchParams.keys()].some(key => key !== 'reference')
      || (expectedReference !== undefined && value.searchParams.get('reference') !== expectedReference)) throw new Error();
    return value.href;
  } catch { throw new AppError(502, 'PAYMENT_REDIRECT_INVALID', 'Payment redirect is not allowed.'); }
}

export class DuitkuGateway implements PaymentGatewayPort {
  readonly provider = 'duitku' as const;
  readonly environment: GatewayEnvironment;
  readonly merchantCode: string;
  readonly #apiKey: string;
  readonly #callbackUrl: string;
  readonly #returnUrl: string;
  readonly #expiryMinutes: number;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #logger: Logger;
  constructor(config: { environment: GatewayEnvironment; merchantCode: string; apiKey: string; callbackUrl: string; returnUrl: string; expiryMinutes: number; timeoutSeconds: number }, transport: typeof fetch = fetch, logger: Logger = jsonLogger) {
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(config.merchantCode) || !config.apiKey.trim() || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new AppError(500, 'PAYMENT_CONFIG_INVALID', 'Payment configuration is invalid.');
    this.environment = config.environment; this.merchantCode = config.merchantCode; this.#apiKey = config.apiKey;
    this.#callbackUrl = config.callbackUrl; this.#returnUrl = config.returnUrl;
    this.#expiryMinutes = config.expiryMinutes; this.#timeoutMs = config.timeoutSeconds * 1000; this.#fetch = transport; this.#logger = logger;
  }
  #signature(input: string) { return createHmac('sha256', this.#apiKey).update(input).digest('hex'); }
  async #post(url: string, body: string, headers: Record<string,string>): Promise<unknown> {
    const started = Date.now();
    let category = 'transport', httpStatus: number | null = null;
    try {
      // Fixed endpoints, no redirects, default Node TLS verification; no automatic retry.
      const response = await this.#fetch(url, { method: 'POST', body, headers, redirect: 'error', signal: AbortSignal.timeout(this.#timeoutMs) });
      httpStatus = response.status;
      category = 'http_error';
      if (!response.ok) throw new Error();
      category = 'response_too_large';
      if (Number(response.headers.get('content-length') ?? 0) > 32768) throw new Error();
      const reader = response.body?.getReader();
      category = 'empty_body';
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) { category = 'body_read'; const part = await reader.read(); if (part.done) break; size += part.value.length; category = 'response_too_large'; if (size > 32768) throw new Error(); chunks.push(part.value); }
      } finally { await reader.cancel().catch(() => {}); }
      category = 'invalid_json';
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch (error) {
      // Never log provider messages, URLs, bodies, credentials or raw exceptions.
      const cause = error instanceof Error ? error.cause : null;
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
      if (error instanceof Error && ['TimeoutError','AbortError'].includes(error.name)) category = 'timeout';
      else if (category === 'transport') {
        if (['ENOTFOUND','EAI_AGAIN'].includes(String(code))) category = 'dns';
        else if (['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','SELF_SIGNED_CERT_IN_CHAIN'].includes(String(code))) category = 'tls';
        else if (['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(String(code))) category = 'timeout';
        else if (['ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH'].includes(String(code))) category = 'connection';
      }
      try {
        this.#logger.error('payment.gateway-request-failed', {
          provider:this.provider, environment:this.environment,
          operation:url.endsWith('/transactionStatus') ? 'transaction_status' : 'create_invoice',
          category, http_status:httpStatus, duration_ms:Math.max(0,Date.now()-started),
        });
      } catch { /* Diagnostics must not alter the public error contract. */ }
      throw new AppError(503, 'PAYMENT_GATEWAY_UNAVAILABLE', 'Payment verification is temporarily unavailable.');
    }
  }
  async createCheckout(input: CreateGatewayCheckout): Promise<GatewayCheckoutResult> {
    if (!order.safeParse(input.orderId).success || !Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount !== input.item.price) throw new AppError(500,'PAYMENT_AMOUNT_INVALID','Payment amount is invalid.');
    const timestamp = String(Date.now());
    const result = await this.#post(`https://${this.environment === 'sandbox' ? 'api-sandbox' : 'api-prod'}.duitku.com/api/merchant/createInvoice`, JSON.stringify({
      paymentAmount: input.amount, merchantOrderId: input.orderId, productDetails: input.item.name,
      email: input.customer.email, customerVaName: input.customer.firstName.slice(0,20),
      itemDetails: [{ name: input.item.name.slice(0,50), price: input.amount, quantity: 1 }],
      callbackUrl: this.#callbackUrl, returnUrl: this.#returnUrl, expiryPeriod: this.#expiryMinutes,
    }), { 'content-type':'application/json', 'x-duitku-timestamp':timestamp, 'x-duitku-merchantcode':this.merchantCode,
      'x-duitku-signature':this.#signature(this.merchantCode + timestamp) });
    const parsed = invoiceSchema.safeParse(result);
    if (!parsed.success || parsed.data.merchantCode !== this.merchantCode) throw new AppError(502,'PAYMENT_GATEWAY_INVALID_RESPONSE','Payment gateway returned an invalid response.');
    return { reference: parsed.data.reference, redirectUrl: validateDuitkuRedirect(parsed.data.paymentUrl, this.environment, parsed.data.reference) };
  }
  async verifyNotification(payload: unknown): Promise<VerifiedGatewayNotification> {
    const parsed = duitkuCallbackSchema.safeParse(payload);
    if (!parsed.success) throw new AppError(400,'PAYMENT_NOTIFICATION_INVALID','Payment notification is invalid.');
    const v = parsed.data;
    if (v.merchantCode !== this.merchantCode) throw new AppError(400,'PAYMENT_MERCHANT_MISMATCH','Payment merchant does not match.');
    const expected = this.#signature(v.merchantCode + v.amount + v.merchantOrderId);
    if (!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(v.signature,'hex'))) throw new AppError(400,'PAYMENT_SIGNATURE_INVALID','Payment notification signature is invalid.');
    // resultCode/reference are NOT signed. This notification is only a trigger;
    // PaymentService fetches status independently before mutating entitlement.
    return { orderId:v.merchantOrderId, grossAmount:Number(v.amount).toFixed(2), statusCode:v.resultCode,
      status:'pending', transactionStatus:'callback', transactionId:v.reference, fraudStatus:null,
      eventKey:createHash('sha256').update(`duitku-callback|${v.merchantOrderId}|${v.reference}`).digest('hex'),
      raw:{ orderId:v.merchantOrderId, amount:Number(v.amount), reference:v.reference } };
  }
  async getTransactionStatus(orderId: string): Promise<GatewayTransactionStatus> {
    if (!order.safeParse(orderId).success) throw new AppError(422,'PAYMENT_ORDER_INVALID','Payment order is invalid.');
    const result = await this.#post(`https://${this.environment === 'sandbox' ? 'sandbox' : 'passport'}.duitku.com/webapi/api/merchant/transactionStatus`,
      new URLSearchParams({ merchantCode:this.merchantCode, merchantOrderId:orderId, signature:this.#signature(this.merchantCode + orderId) }).toString(),
      { 'content-type':'application/x-www-form-urlencoded' });
    const parsed = statusSchema.safeParse(result);
    if (!parsed.success || parsed.data.merchantOrderId !== orderId) throw new AppError(502,'PAYMENT_GATEWAY_INVALID_RESPONSE','Payment gateway returned an invalid response.');
    const v = parsed.data, status = ({ '00':'paid','01':'pending','02':'canceled' } as const)[v.statusCode];
    return { orderId:v.merchantOrderId, grossAmount:Number(v.amount).toFixed(2), statusCode:v.statusCode,
      status, transactionStatus:status, transactionId:v.reference, fraudStatus:null,
      raw:{ orderId:v.merchantOrderId, amount:Number(v.amount), reference:v.reference, statusCode:v.statusCode } };
  }
}
