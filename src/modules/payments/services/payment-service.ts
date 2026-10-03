import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/http/errors.ts';
import type { CheckoutInput } from '../dto/payment-input.ts';
import type { GatewayEnvironment, GatewayTransactionStatus, PaymentGatewayPort, PaymentProvider } from '../gateways/payment-gateway-port.ts';
import type { PaymentRecord, PaymentRepository } from '../repositories/payment-repository.ts';
import type { RateLimiter } from '../../auth/repositories/auth-repository.ts';
import { duitkuCallbackSchema, validateDuitkuRedirect } from '../gateways/duitku-gateway.ts';

export type CheckoutResponse = Omit<PaymentRecord,'reference'|'merchantCode'>;
function consumer(payment:PaymentRecord):CheckoutResponse {
  const { reference:_reference,merchantCode:_merchant,...result } = payment;
  return { ...result,redirectUrl:payment.provider === 'duitku' && payment.status === 'pending' ? payment.redirectUrl : null };
}

export class PaymentService {
  readonly #repository:PaymentRepository;
  readonly #gateways:readonly PaymentGatewayPort[];
  readonly #provider:PaymentProvider;
  readonly #environment:GatewayEnvironment;
  readonly #enabled:boolean;
  readonly #expiryMinutes:number;
  readonly #rateLimiter:RateLimiter|undefined;
  readonly #sandboxUsers:ReadonlySet<string>;
  constructor(deps:{repository:PaymentRepository;gateways?:readonly PaymentGatewayPort[];provider?:PaymentProvider;environment?:GatewayEnvironment;checkoutEnabled?:boolean;expiryMinutes?:number;rateLimiter?:RateLimiter;sandboxAllowedUserPublicIds?:readonly string[]}) {
    this.#repository=deps.repository;this.#gateways=deps.gateways??[];this.#provider=deps.provider??'duitku';this.#environment=deps.environment??'sandbox';
    if (this.#provider !== 'duitku') throw new AppError(500,'PAYMENT_CONFIG_INVALID','Payment configuration is invalid.');
    this.#enabled=deps.checkoutEnabled??false;this.#expiryMinutes=deps.expiryMinutes??60;this.#rateLimiter=deps.rateLimiter;
    this.#sandboxUsers=new Set(deps.sandboxAllowedUserPublicIds??[]);
  }
  capabilities(userPublicId?:string) {
    return { checkoutEnabled:this.#enabled && (this.#environment!=='sandbox' || this.#sandboxUsers.has(userPublicId??'')) && this.#gateways.some(g=>g.provider===this.#provider&&g.environment===this.#environment),provider:this.#provider,environment:this.#environment,idempotencyKeyRequired:true,reconcileCooldownSeconds:30 };
  }
  async checkout(userPublicId:string,input:CheckoutInput,idempotencyKey:string):Promise<CheckoutResponse> {
    if (!this.#enabled) throw new AppError(503,'PAYMENT_CHECKOUT_DISABLED','Payment checkout is currently disabled.');
    if (this.#environment==='sandbox' && !this.#sandboxUsers.has(userPublicId)) throw new AppError(403,'PAYMENT_SANDBOX_FORBIDDEN','Sandbox checkout is restricted to approved test accounts.');
    const gateway=this.#gateways.find(g=>g.provider===this.#provider&&g.environment===this.#environment);
    if (!gateway) throw new AppError(503,'PAYMENT_GATEWAY_UNAVAILABLE','Payment gateway is unavailable.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new AppError(422,'VALIDATION_ERROR','A UUID Idempotency-Key is required.');
    await this.#limit('payment-checkout',userPublicId,10,60,429);
    const reservation=await this.#repository.reserveCheckout({userPublicId,planCode:input.planCode,provider:gateway.provider,environment:gateway.environment,merchantCode:gateway.merchantCode,
      keyHash:createHash('sha256').update(`${userPublicId}\0${idempotencyKey.toLowerCase()}`).digest('hex'),requestHash:createHash('sha256').update(JSON.stringify({planCode:input.planCode})).digest('hex'),
      publicId:randomUUID(),orderId:`KND_${randomUUID().replaceAll('-','')}`,expiryMinutes:this.#expiryMinutes,now:new Date()});
    if (!reservation.created) return consumer(reservation.payment);
    const a=reservation.authority!;
    try {
      await this.#limit('payment-create',`${gateway.provider}:${gateway.environment}:${gateway.merchantCode??''}`,20,60,503);
      const result=await gateway.createCheckout({orderId:reservation.payment.merchantOrderId,amount:a.targetPlan.amount,customer:{email:a.email,firstName:a.fullName},
        item:{id:a.targetPlan.code,name:`Upgrade ${a.currentPlanCode.toUpperCase()} ke ${a.targetPlan.name}`,quantity:1,price:a.targetPlan.amount}});
      if (gateway.provider==='duitku') {
        if (!result.reference) throw new AppError(502,'PAYMENT_GATEWAY_INVALID_RESPONSE','Payment gateway returned an invalid response.');
        validateDuitkuRedirect(result.redirectUrl,gateway.environment,result.reference);
      }
      return consumer(await this.#repository.attachInvoice(reservation.payment.publicId,result.reference,result.redirectUrl,new Date()));
    } catch (error) {
      // Never issue a second create for this attempt: transport failure is ambiguous.
      await this.#repository.markCheckoutUncertain(reservation.payment.publicId,new Date());
      if (error instanceof AppError && ['PAYMENT_REDIRECT_INVALID','PAYMENT_GATEWAY_INVALID_RESPONSE','PAYMENT_REFERENCE_MISMATCH'].includes(error.code)) throw new AppError(error.status,error.code,error.message,{publicId:reservation.payment.publicId});
      return this.get(userPublicId,reservation.payment.publicId);
    }
  }
  async list(userPublicId:string){return (await this.#repository.listOwned(userPublicId)).map(consumer);}
  async #owned(userPublicId:string,publicId:string){const result=await this.#repository.findOwned(userPublicId,publicId);if(!result)throw new AppError(404,'PAYMENT_NOT_FOUND','Payment not found.');return result;}
  async get(userPublicId:string,publicId:string){return consumer(await this.#owned(userPublicId,publicId));}
  #gateway(payment:PaymentRecord):PaymentGatewayPort {
    if (payment.provider !== 'duitku') throw new AppError(410,'PAYMENT_PROVIDER_RETIRED','This historical payment requires manual review.');
    const result=this.#gateways.find(g=>g.provider===payment.provider && (!payment.environment || g.environment===payment.environment) && (!payment.merchantCode || g.merchantCode===payment.merchantCode));
    if (!result) throw new AppError(503,'PAYMENT_PROVIDER_UNAVAILABLE','The transaction provider is unavailable.');
    return result;
  }
  #matches(payment:PaymentRecord,status:GatewayTransactionStatus) {
    if (status.orderId!==payment.merchantOrderId) throw new AppError(400,'PAYMENT_ORDER_MISMATCH','Payment order does not match.');
    if (status.grossAmount!==payment.amount.toFixed(2)) throw new AppError(400,'PAYMENT_AMOUNT_MISMATCH','Payment amount does not match.');
    if (payment.reference && status.transactionId!==payment.reference) throw new AppError(400,'PAYMENT_REFERENCE_MISMATCH','Payment reference does not match.');
  }
  async #status(payment:PaymentRecord,gateway:PaymentGatewayPort,callback:boolean) {
    if (!await this.#repository.claimStatusCheck(payment.publicId,new Date())) throw new AppError(callback?503:429,callback?'PAYMENT_VERIFICATION_BUSY':'RATE_LIMITED','Payment verification is temporarily limited.');
    await this.#limit('payment-status',`${gateway.provider}:${gateway.environment}:${gateway.merchantCode??''}`,20,60,callback?503:429);
    const status=await gateway.getTransactionStatus(payment.merchantOrderId);this.#matches(payment,status);return status;
  }
  async #limit(action:string,key:string,limit:number,seconds:number,status:number) {
    if (!this.#rateLimiter || !await this.#rateLimiter.consume(action,key,limit,seconds)) throw new AppError(status,status===429?'RATE_LIMITED':'PAYMENT_VERIFICATION_BUSY','Payment requests are temporarily limited.');
  }
  async #apply(payment:PaymentRecord,gateway:PaymentGatewayPort,status:GatewayTransactionStatus,eventKey?:string) {
    const key=eventKey??createHash('sha256').update(`${gateway.provider}|${gateway.environment}|${status.orderId}|${status.transactionId??''}|${status.statusCode}|${status.transactionStatus}`).digest('hex');
    const payloadHash=createHash('sha256').update(JSON.stringify({orderId:status.orderId,amount:status.grossAmount,reference:status.transactionId,status:status.status,statusCode:status.statusCode,transactionStatus:status.transactionStatus,fraudStatus:status.fraudStatus})).digest('hex');
    const outcome=await this.#repository.applyVerifiedNotification({...status,eventKey:key,provider:gateway.provider,environment:gateway.environment,merchantCode:gateway.merchantCode},payloadHash,new Date());
    const errors={unknown_order:'PAYMENT_ORDER_UNKNOWN',amount_mismatch:'PAYMENT_AMOUNT_MISMATCH',event_conflict:'PAYMENT_EVENT_CONFLICT',provider_mismatch:'PAYMENT_PROVIDER_MISMATCH',reference_mismatch:'PAYMENT_REFERENCE_MISMATCH'} as const;
    if (outcome.result in errors) throw new AppError(outcome.result==='event_conflict'?409:400,errors[outcome.result as keyof typeof errors],'Payment evidence does not match.');
    return outcome;
  }
  async duitkuCallback(payload:unknown) {
    const parsed=duitkuCallbackSchema.safeParse(payload);
    if (!parsed.success) throw new AppError(400,'PAYMENT_NOTIFICATION_INVALID','Payment notification is invalid.');
    const payment=await this.#repository.findByOrder(parsed.data.merchantOrderId);
    if (!payment) throw new AppError(400,'PAYMENT_ORDER_UNKNOWN','Payment order is unknown.');
    if (payment.provider!=='duitku') throw new AppError(400,'PAYMENT_PROVIDER_MISMATCH','Payment provider does not match.');
    const gateway=this.#gateway(payment),verified=await gateway.verifyNotification(payload);
    this.#matches(payment,verified);
    if (['paid','refunded','refund_pending_review'].includes(payment.status)) return {result:'duplicate',paymentPublicId:payment.publicId,paymentStatus:payment.status};
    const status=await this.#status(payment,gateway,true);
    if (status.transactionId!==verified.transactionId) throw new AppError(400,'PAYMENT_REFERENCE_MISMATCH','Payment reference does not match.');
    return this.#apply(payment,gateway,status);
  }
  async reconcile(userPublicId:string,publicId:string) {
    const payment=await this.#owned(userPublicId,publicId),gateway=this.#gateway(payment);
    const status=await this.#status(payment,gateway,false);return this.#apply(payment,gateway,status);
  }
  currentSubscription(userPublicId:string){return this.#repository.findCurrentSubscription(userPublicId,new Date());}
}
