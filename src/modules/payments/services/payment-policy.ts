import { AppError } from '../../../shared/http/errors.ts';
import type { CheckoutAuthority } from '../repositories/payment-repository.ts';

const prices: Readonly<Record<string,number>> = { 'starter:basic':55000,'starter:pro':97000,'basic:pro':55000 };
export function priceCheckout(authority: CheckoutAuthority): CheckoutAuthority {
  if (authority.targetPlan.durationDays !== 365 || authority.targetPlan.currency !== 'IDR') throw new AppError(409,'PLAN_NOT_PURCHASABLE','The selected annual plan is not configured for a 365-day IDR term.');
  const amount = prices[`${authority.currentPlanCode}:${authority.targetPlan.code}`];
  if (!amount) throw new AppError(409,'PLAN_UPGRADE_NOT_AVAILABLE','No upgrade checkout is available for the current membership.');
  return { ...authority,targetPlan:{ ...authority.targetPlan,amount } };
}
