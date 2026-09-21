import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CheckoutAuthority, CurrentSubscription, NotificationOutcome, PaymentNotification, PaymentRecord, PaymentRepository } from './payment-repository.ts';

type AuthorityRow = RowDataPacket & { user_id: number; email: string; full_name: string; current_plan_code: 'starter' | 'basic' | 'pro'; code: 'basic' | 'pro'; name: string; price_amount: number | string; currency: string; duration_days: number };
type PaymentRow = RowDataPacket & { public_id: string; merchant_order_id: string; target_plan_code: string; plan_name_snapshot: string; duration_days_snapshot: number; amount: number | string; currency: string; status: string; gateway_status: string | null; snap_redirect_url: string | null; paid_at: Date | null; expires_at: Date | null; created_at: Date };
type CurrentPaymentRow = RowDataPacket & { id: number; public_id: string; user_id: number; amount: number | string; status: string; target_plan_code: 'basic' | 'pro'; duration_days_snapshot: number; subscription_id: number | null };
type SubscriptionRow = RowDataPacket & { id: number; plan_code: 'basic' | 'pro'; status: string; starts_at: Date; ends_at: Date };
type PeriodRow = RowDataPacket & { id: number; period_start: Date; period_end: Date };
const payment = (row: PaymentRow): PaymentRecord => ({ publicId: row.public_id, merchantOrderId: row.merchant_order_id, targetPlanCode: row.target_plan_code, planName: row.plan_name_snapshot, durationDays: row.duration_days_snapshot, amount: Number(row.amount), currency: row.currency, status: row.status, gatewayStatus: row.gateway_status, redirectUrl: row.snap_redirect_url, paidAt: row.paid_at, expiresAt: row.expires_at, createdAt: row.created_at });
const columns = 'p.public_id,p.merchant_order_id,p.target_plan_code,p.plan_name_snapshot,p.duration_days_snapshot,p.amount,p.currency,p.status,p.gateway_status,p.snap_redirect_url,p.paid_at,p.expires_at,p.created_at';

export class MySqlPaymentRepository implements PaymentRepository {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async findCheckoutAuthority(userPublicId: string, targetPlanCode: 'basic' | 'pro'): Promise<CheckoutAuthority | null> {
    const [rows] = await this.#pool.execute<AuthorityRow[]>(`SELECT u.id user_id,u.email,COALESCE(cc.full_name,SUBSTRING_INDEX(u.email,'@',1)) full_name,p.code,p.name,p.price_amount,p.currency,p.duration_days,COALESCE((SELECT sp.code FROM subscriptions s JOIN plans sp ON sp.id=s.plan_id WHERE s.user_id=u.id AND s.status='active' AND s.starts_at<=UTC_TIMESTAMP() AND s.ends_at>UTC_TIMESTAMP() ORDER BY s.ends_at DESC LIMIT 1),'starter') current_plan_code FROM users u JOIN cards c ON c.user_id=u.id AND c.deleted_at IS NULL AND c.status<>'deleted' LEFT JOIN card_contacts cc ON cc.card_id=c.id JOIN plans p ON p.code=? AND p.is_active=1 WHERE u.public_id=? AND u.status='active' AND u.email_verified_at IS NOT NULL LIMIT 1`, [targetPlanCode, userPublicId]);
    const row = rows[0];
    return row ? { userId: row.user_id, email: row.email, fullName: row.full_name, currentPlanCode: row.current_plan_code, targetPlan: { code: row.code, name: row.name, amount: Number(row.price_amount), currency: row.currency, durationDays: row.duration_days } } : null;
  }

  async insertPending(input: { publicId: string; merchantOrderId: string; authority: CheckoutAuthority; now: Date }): Promise<PaymentRecord> {
    const a = input.authority;
    await this.#pool.execute(`INSERT INTO payments(public_id,user_id,gateway,merchant_order_id,target_plan_code,plan_name_snapshot,duration_days_snapshot,amount,currency,status,created_at,updated_at) VALUES(?,?,'midtrans',?,?,?,?,?,?,'pending',?,?)`, [input.publicId, a.userId, input.merchantOrderId, a.targetPlan.code, a.targetPlan.name, a.targetPlan.durationDays, a.targetPlan.amount, a.targetPlan.currency, input.now, input.now]);
    const result = await this.#findOwnedByPublicId(input.publicId);
    if (!result) throw new Error('Inserted payment could not be read.');
    return result;
  }

  async attachGatewayCheckout(publicId: string, redirectUrl: string, expiresAt: Date | null, now: Date): Promise<PaymentRecord | null> {
    await this.#pool.execute<ResultSetHeader>(`UPDATE payments SET snap_redirect_url=?,expires_at=?,gateway_status='pending',updated_at=? WHERE public_id=? AND status='pending'`, [redirectUrl, expiresAt, now, publicId]);
    return this.#findOwnedByPublicId(publicId);
  }

  async markCheckoutFailed(publicId: string, now: Date): Promise<void> {
    await this.#pool.execute(`UPDATE payments SET status='failed',gateway_status='checkout_error',updated_at=? WHERE public_id=? AND status='pending'`, [now, publicId]);
  }

  async listOwned(userPublicId: string): Promise<PaymentRecord[]> {
    const [rows] = await this.#pool.execute<PaymentRow[]>(`SELECT ${columns} FROM payments p JOIN users u ON u.id=p.user_id WHERE u.public_id=? AND u.status='active' ORDER BY p.created_at DESC,p.id DESC`, [userPublicId]);
    return rows.map(payment);
  }

  async findOwned(userPublicId: string, publicId: string): Promise<PaymentRecord | null> {
    const [rows] = await this.#pool.execute<PaymentRow[]>(`SELECT ${columns} FROM payments p JOIN users u ON u.id=p.user_id WHERE u.public_id=? AND u.status='active' AND p.public_id=? LIMIT 1`, [userPublicId, publicId]);
    return rows[0] ? payment(rows[0]) : null;
  }

  async applyVerifiedNotification(notification: PaymentNotification, payloadHash: string, now: Date): Promise<NotificationOutcome> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      // Serialize subscription changes across different orders for one user.
      await connection.execute(`SELECT u.id FROM users u WHERE u.id=(SELECT user_id FROM payments WHERE merchant_order_id=?) FOR UPDATE`, [notification.orderId]);
      const [payments] = await connection.execute<CurrentPaymentRow[]>(`SELECT id,public_id,user_id,amount,status,target_plan_code,duration_days_snapshot,subscription_id FROM payments WHERE merchant_order_id=? LIMIT 1 FOR UPDATE`, [notification.orderId]);
      const current = payments[0];
      if (!current) {
        await connection.rollback();
        return { result: 'unknown_order', paymentPublicId: null, paymentStatus: null };
      }
      const [events] = await connection.execute<Array<RowDataPacket & { payload_hash: string }>>(`SELECT payload_hash FROM payment_events WHERE gateway_event_key=? LIMIT 1 FOR UPDATE`, [notification.eventKey]);
      if (events[0]) {
        await connection.commit();
        return { result: events[0].payload_hash === payloadHash ? 'duplicate' : 'event_conflict', paymentPublicId: current.public_id, paymentStatus: current.status };
      }
      await connection.execute(`INSERT INTO payment_events(payment_id,gateway_event_key,payload_hash,event_type,received_at,processing_status) VALUES(?,?,?,?,?,'received')`, [current.id, notification.eventKey, payloadHash, notification.transactionStatus, now]);
      if (notification.grossAmount !== `${Number(current.amount).toFixed(2)}`) {
        await connection.execute(`UPDATE payment_events SET processed_at=?,processing_status='rejected',error_message='amount_mismatch' WHERE gateway_event_key=?`, [now, notification.eventKey]);
        await connection.commit();
        return { result: 'amount_mismatch', paymentPublicId: current.public_id, paymentStatus: current.status };
      }

      const successful = (notification.transactionStatus === 'settlement' || (notification.transactionStatus === 'capture' && notification.fraudStatus === 'accept')) && notification.statusCode === '200';
      const fullRefund = notification.transactionStatus === 'refund';
      const partialRefund = notification.transactionStatus === 'partial_refund';
      const target = successful ? 'paid' : ({ deny: 'failed', failure: 'failed', expire: 'expired', cancel: 'canceled', refund: 'refunded' } as Record<string, string>)[notification.transactionStatus] ?? null;

      let outcome: NotificationOutcome['result'] = 'ignored';
      let paymentStatus = current.status;
      const terminalRefund = ['refunded', 'refund_pending_review'].includes(current.status);
      if (terminalRefund) {
        // Late settlement/refund delivery must never regrant or reapply a term.
      } else if (target === 'paid' && current.status !== 'paid') {
        await this.#activateSubscription(connection, current, notification, now);
        outcome = 'processed';
        paymentStatus = 'paid';
      } else if (fullRefund && current.status === 'paid') {
        const refunded = await this.#refundSubscription(connection, current, notification, now);
        outcome = 'processed';
        paymentStatus = refunded ? 'refunded' : 'refund_pending_review';
      } else if (partialRefund && current.status === 'paid') {
        await connection.execute(`UPDATE payments SET gateway_transaction_id=?,gateway_status=?,fraud_status=?,updated_at=? WHERE id=?`, [notification.transactionId, notification.transactionStatus, notification.fraudStatus, now, current.id]);
        await connection.execute(`INSERT INTO activity_logs(user_id,event,metadata_text,created_at) VALUES(?,'payment.partial-refund-pending-review',?,?)`, [current.user_id, JSON.stringify({ paymentPublicId: current.public_id }), now]);
        outcome = 'processed';
      } else if (target && current.status !== 'paid') {
        await connection.execute(`UPDATE payments SET gateway_transaction_id=?,gateway_status=?,fraud_status=?,status=?,updated_at=? WHERE id=?`, [notification.transactionId, notification.transactionStatus, notification.fraudStatus, target, now, current.id]);
        outcome = 'processed';
        paymentStatus = target;
      }

      await connection.execute(`UPDATE payment_events SET processed_at=?,processing_status=? WHERE gateway_event_key=?`, [now, outcome === 'processed' ? 'processed' : 'ignored', notification.eventKey]);
      await connection.commit();
      return { result: outcome, paymentPublicId: current.public_id, paymentStatus };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findCurrentSubscription(userPublicId: string, now: Date): Promise<CurrentSubscription | null> {
    const [rows] = await this.#pool.execute<(RowDataPacket & { public_id: string; plan_code: 'basic' | 'pro'; status: string; starts_at: Date; ends_at: Date })[]>(`SELECT s.public_id,p.code plan_code,s.status,s.starts_at,s.ends_at FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN users u ON u.id=s.user_id WHERE u.public_id=? AND u.status='active' AND s.status='active' AND s.starts_at<=? AND s.ends_at>? ORDER BY s.ends_at DESC LIMIT 1`, [userPublicId, now, now]);
    const row = rows[0];
    return row ? { publicId: row.public_id, planCode: row.plan_code, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at } : null;
  }

  async #activateSubscription(connection: PoolConnection, current: CurrentPaymentRow, notification: PaymentNotification, now: Date): Promise<void> {
    const [activeRows] = await connection.execute<SubscriptionRow[]>(`SELECT s.id,p.code plan_code,s.starts_at,s.ends_at FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.status='active' AND s.ends_at>? ORDER BY s.ends_at DESC LIMIT 1 FOR UPDATE`, [current.user_id, now]);
    const existing = activeRows[0];
    let subscriptionId: number;
    let periodStart: Date;
    let periodEnd: Date;
    if (existing && existing.plan_code === current.target_plan_code) {
      subscriptionId = existing.id;
      periodStart = existing.ends_at > now ? existing.ends_at : now;
      periodEnd = new Date(periodStart.getTime() + current.duration_days_snapshot * 86_400_000);
      await connection.execute(`UPDATE subscriptions SET ends_at=?,updated_at=? WHERE id=?`, [periodEnd, now, subscriptionId]);
    } else {
      if (existing) await connection.execute(`UPDATE subscriptions SET status='superseded',updated_at=? WHERE id=?`, [now, existing.id]);
      periodStart = now;
      periodEnd = new Date(now.getTime() + current.duration_days_snapshot * 86_400_000);
      const [result] = await connection.execute<ResultSetHeader>(`INSERT INTO subscriptions(public_id,user_id,plan_id,status,starts_at,ends_at,created_at,updated_at) SELECT ?,?,id,'active',?,?,?,? FROM plans WHERE code=?`, [randomUUID(), current.user_id, periodStart, periodEnd, now, now, current.target_plan_code]);
      subscriptionId = result.insertId;
    }
    await connection.execute(`UPDATE payments SET subscription_id=?,gateway_transaction_id=?,gateway_status=?,fraud_status=?,status='paid',paid_at=?,updated_at=? WHERE id=?`, [subscriptionId, notification.transactionId, notification.transactionStatus, notification.fraudStatus, now, now, current.id]);
    await connection.execute(`INSERT INTO subscription_periods(public_id,subscription_id,source_payment_id,period_start,period_end,created_at) VALUES(?,?,?,?,?,?)`, [randomUUID(), subscriptionId, current.id, periodStart, periodEnd, now]);
    await connection.execute(`UPDATE cards SET plan_code=?,updated_at=? WHERE user_id=? AND deleted_at IS NULL`, [current.target_plan_code, now, current.user_id]);
    await connection.execute(`INSERT INTO activity_logs(user_id,event,metadata_text,created_at) VALUES(?,'payment.subscription-activated',?,?)`, [current.user_id, JSON.stringify({ paymentPublicId: current.public_id, planCode: current.target_plan_code }), now]);
  }

  async #refundSubscription(connection: PoolConnection, current: CurrentPaymentRow, notification: PaymentNotification, now: Date): Promise<boolean> {
    if (!current.subscription_id) {
      await this.#markRefundPendingReview(connection, current, notification, now, 'missing_subscription');
      return false;
    }
    const [periodRows] = await connection.execute<PeriodRow[]>(`SELECT id,period_start,period_end FROM subscription_periods WHERE source_payment_id=? AND subscription_id=? LIMIT 1 FOR UPDATE`, [current.id, current.subscription_id]);
    const sourcePeriod = periodRows[0];
    if (!sourcePeriod) {
      await this.#markRefundPendingReview(connection, current, notification, now, 'legacy_period_missing');
      return false;
    }
    const [subscriptionRows] = await connection.execute<SubscriptionRow[]>(`SELECT s.id,p.code plan_code,s.status,s.starts_at,s.ends_at FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.id=? AND s.user_id=? LIMIT 1 FOR UPDATE`, [current.subscription_id, current.user_id]);
    const subscription = subscriptionRows[0];
    if (!subscription || !['active', 'superseded'].includes(subscription.status) || subscription.ends_at.getTime() !== sourcePeriod.period_end.getTime()) {
      await this.#markRefundPendingReview(connection, current, notification, now, 'period_not_current');
      return false;
    }

    // Period rows are audit history, not mutable entitlement state. Remove the
    // latest purchased term by restoring its start, preserving prior paid time.
    const previousEnd = sourcePeriod.period_start;
    if (previousEnd > now) {
      await connection.execute(`UPDATE subscriptions SET ends_at=?,updated_at=? WHERE id=?`, [previousEnd, now, subscription.id]);
      await connection.execute(`UPDATE payments SET gateway_transaction_id=?,gateway_status=?,fraud_status=?,status='refunded',updated_at=? WHERE id=?`, [notification.transactionId, notification.transactionStatus, notification.fraudStatus, now, current.id]);
      await connection.execute(`INSERT INTO activity_logs(user_id,event,metadata_text,created_at) VALUES(?,'payment.subscription-period-refunded',?,?)`, [current.user_id, JSON.stringify({ paymentPublicId: current.public_id, planCode: subscription.plan_code }), now]);
      return true;
    }

    await connection.execute(`UPDATE subscriptions SET status='refunded',ends_at=?,updated_at=? WHERE id=?`, [now, now, subscription.id]);
    const [fallbackRows] = await connection.execute<SubscriptionRow[]>(`SELECT s.id,p.code plan_code,s.status,s.starts_at,s.ends_at FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.id<>? AND s.status IN ('active','superseded') AND s.starts_at<=? AND s.ends_at>? ORDER BY (s.status='active') DESC,s.ends_at DESC LIMIT 1 FOR UPDATE`, [current.user_id, subscription.id, now, now]);
    const fallback = fallbackRows[0];
    const effectivePlan = fallback?.plan_code ?? 'starter';
    if (fallback?.status === 'superseded') await connection.execute(`UPDATE subscriptions SET status='active',updated_at=? WHERE id=?`, [now, fallback.id]);
    await this.#syncCardPlan(connection, current.user_id, effectivePlan, now);
    await connection.execute(`UPDATE payments SET gateway_transaction_id=?,gateway_status=?,fraud_status=?,status='refunded',updated_at=? WHERE id=?`, [notification.transactionId, notification.transactionStatus, notification.fraudStatus, now, current.id]);
    await connection.execute(`INSERT INTO activity_logs(user_id,event,metadata_text,created_at) VALUES(?,'payment.subscription-refunded',?,?)`, [current.user_id, JSON.stringify({ paymentPublicId: current.public_id, planCode: effectivePlan }), now]);
    return true;
  }

  async #markRefundPendingReview(connection: PoolConnection, current: CurrentPaymentRow, notification: PaymentNotification, now: Date, reason: string): Promise<void> {
    // Legacy/mid-term refunds cannot safely be reconstructed. Suspend the
    // affected subscription until operations reconcile it; do not keep Pro.
    if (current.subscription_id) {
      await connection.execute(`UPDATE subscriptions SET status='refund_pending_review',updated_at=? WHERE id=? AND user_id=?`, [now, current.subscription_id, current.user_id]);
    }
    const [active] = await connection.execute<SubscriptionRow[]>(`SELECT s.id,p.code plan_code,s.starts_at,s.ends_at FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.status='active' AND s.starts_at<=? AND s.ends_at>? ORDER BY s.ends_at DESC LIMIT 1 FOR UPDATE`, [current.user_id, now, now]);
    const planCode = active[0]?.plan_code ?? 'starter';
    await this.#syncCardPlan(connection, current.user_id, planCode, now);
    await connection.execute(`UPDATE payments SET gateway_transaction_id=?,gateway_status=?,fraud_status=?,status='refund_pending_review',updated_at=? WHERE id=?`, [notification.transactionId, notification.transactionStatus, notification.fraudStatus, now, current.id]);
    await connection.execute(`INSERT INTO activity_logs(user_id,event,metadata_text,created_at) VALUES(?,'payment.refund-pending-review',?,?)`, [current.user_id, JSON.stringify({ paymentPublicId: current.public_id, reason }), now]);
  }

  async #syncCardPlan(connection: PoolConnection, userId: number, planCode: string, now: Date): Promise<void> {
    const [themes] = await connection.execute<Array<RowDataPacket & { id: number }>>(`SELECT t.id FROM plans p JOIN plan_theme_access pta ON pta.plan_id=p.id JOIN themes t ON t.id=pta.theme_id WHERE p.code=? AND p.is_active=1 AND t.is_active=1 ORDER BY t.display_order,t.id LIMIT 1`, [planCode]);
    if (!themes[0]) throw new Error('No active default theme for effective plan.');
    await connection.execute(`UPDATE cards c SET plan_code=?,theme_id=IF(EXISTS(SELECT 1 FROM plan_theme_access a JOIN plans p ON p.id=a.plan_id JOIN themes t ON t.id=a.theme_id WHERE a.theme_id=c.theme_id AND p.code=? AND t.is_active=1),c.theme_id,?),updated_at=? WHERE user_id=? AND deleted_at IS NULL`, [planCode, planCode, themes[0].id, now, userId]);
  }

  async #findOwnedByPublicId(publicId: string): Promise<PaymentRecord | null> {
    const [rows] = await this.#pool.execute<PaymentRow[]>(`SELECT ${columns} FROM payments p WHERE p.public_id=? LIMIT 1`, [publicId]);
    return rows[0] ? payment(rows[0]) : null;
  }
}
