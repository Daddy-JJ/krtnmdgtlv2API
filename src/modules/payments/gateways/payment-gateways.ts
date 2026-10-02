import type { Environment } from '../../../config/environment.ts';
import { DuitkuGateway } from './duitku-gateway.ts';
import type { PaymentGatewayPort } from './payment-gateway-port.ts';

export function createPaymentGateways(env: Environment): PaymentGatewayPort[] {
  const gateways: PaymentGatewayPort[] = [];
  if (env.DUITKU_ENABLED) for (const environment of ['sandbox','production'] as const) {
    const mode = environment === 'sandbox' ? 'SANDBOX' : 'PRODUCTION';
    const merchantCode = env[`DUITKU_${mode}_MERCHANT_CODE`], apiKey = env[`DUITKU_${mode}_API_KEY`];
    if (merchantCode && apiKey) gateways.push(new DuitkuGateway({ environment,merchantCode,apiKey,
      callbackUrl:env[`DUITKU_${mode}_CALLBACK_URL`]!,returnUrl:env[`DUITKU_${mode}_RETURN_URL`]!,
      expiryMinutes:env.DUITKU_EXPIRY_MINUTES,timeoutSeconds:env.DUITKU_HTTP_TIMEOUT_SECONDS }));
  }
  return gateways;
}
