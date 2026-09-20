import { randomUUID } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../../../shared/http/errors.ts';
import type {
  CardIntervention,
  CardInterventionResult,
  FeedbackListInput,
  FeedbackListResult,
  FeedbackStatusUpdate,
  Intervention,
  InterventionResult,
  SuperAdminRecord,
  SuperAdminRepository,
  SuperAdminUserDetail,
} from './super-admin-repository.ts';

type Connection = Awaited<ReturnType<Pool['getConnection']>>;
type SqlValue = string | number | Date | null;

export class MySqlSuperAdminRepository implements SuperAdminRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async statistics(): Promise<SuperAdminRecord | undefined> {
    const [rows] = await this.#pool.execute<Array<RowDataPacket & SuperAdminRecord>>(`SELECT
      (SELECT COUNT(*) FROM users) totalUsers,
      (SELECT COUNT(*) FROM users WHERE email_verified_at IS NOT NULL) verifiedUsers,
      (SELECT COUNT(*) FROM users WHERE email_verified_at IS NULL) unverifiedUsers,
      (SELECT COUNT(*) FROM users WHERE status='active') activeUsers,
      (SELECT COUNT(*) FROM users WHERE status='suspended') suspendedUsers,
      (SELECT COUNT(*) FROM users WHERE created_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY) newUsers30Days,
      tierCounts.starterUsers,
      tierCounts.basicUsers,
      tierCounts.proUsers,
      (SELECT COUNT(*) FROM subscriptions WHERE status='active' AND ends_at>UTC_TIMESTAMP()) activeSubscriptions,
      (SELECT COUNT(*) FROM subscriptions WHERE status='active' AND ends_at BETWEEN UTC_TIMESTAMP() AND UTC_TIMESTAMP()+INTERVAL 30 DAY) expiringSubscriptions,
      (SELECT COUNT(*) FROM resume_requests WHERE created_at>=CURRENT_DATE()) newResumeRequests,
      (SELECT COUNT(*) FROM resume_requests WHERE assigned_specialist_id IS NULL AND status NOT IN ('COMPLETED','EXPIRED','CANCELLED','ARCHIVED')) unassignedResumeRequests,
      (SELECT COUNT(*) FROM resume_requests WHERE status='NEED_MORE_INFORMATION') waitingForInformation,
      (SELECT COUNT(*) FROM resume_requests WHERE status='DATA_COMPLETE') dataCompleteResumeRequests,
      (SELECT COUNT(*) FROM resume_requests WHERE status='IN_PROGRESS') inProgressResumeRequests,
      (SELECT COUNT(*) FROM resume_requests WHERE status='READY_FOR_REVIEW') qualityReviewQueue,
      (SELECT COUNT(*) FROM resume_requests WHERE status IN ('REVISION_REQUESTED','REVISION_IN_PROGRESS')) activeRevisions,
      (SELECT COUNT(*) FROM resume_requests WHERE status='COMPLETED' AND completed_at>=CURRENT_DATE()) completedToday,
      (SELECT COUNT(*) FROM resume_requests WHERE status='COMPLETED' AND retention_expires_at BETWEEN UTC_TIMESTAMP() AND UTC_TIMESTAMP()+INTERVAL 7 DAY) filesExpiringSoon,
      (SELECT COUNT(*) FROM resume_requests WHERE status NOT IN ('COMPLETED','EXPIRED','CANCELLED','ARCHIVED')) activeResumeRequests,
      (SELECT COUNT(*) FROM resume_requests WHERE sla_due_at BETWEEN UTC_TIMESTAMP() AND UTC_TIMESTAMP()+INTERVAL 24 HOUR AND status NOT IN ('COMPLETED','EXPIRED','CANCELLED','ARCHIVED')) slaDueWithin24Hours,
      (SELECT COUNT(*) FROM resume_requests WHERE sla_due_at<UTC_TIMESTAMP() AND status NOT IN ('COMPLETED','EXPIRED','CANCELLED','ARCHIVED')) slaBreached,
      (SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE,data_complete_at,completed_at))/60,1) FROM resume_requests WHERE completed_at IS NOT NULL AND data_complete_at IS NOT NULL) averageTurnaroundHours,
      (SELECT ROUND(100*SUM(event_type='MET')/NULLIF(SUM(event_type IN ('MET','BREACHED')),0),1) FROM resume_request_sla_events) slaMetRate,
      (SELECT COUNT(*) FROM resume_download_logs) resumeDownloads,
      (SELECT COUNT(*) FROM mail_outbox WHERE status='queued') mailQueue,
      (SELECT COUNT(*) FROM mail_outbox WHERE status='failed') failedEmail,
      (SELECT COUNT(*) FROM user_feedback WHERE status='new') newFeedback,
      (SELECT COUNT(*) FROM user_feedback WHERE status='in_review') feedbackInReview,
      (SELECT TIMESTAMPDIFF(HOUR,MIN(created_at),UTC_TIMESTAMP()) FROM user_feedback WHERE status='new') oldestNewFeedbackHours
      FROM (
        SELECT SUM(currentTier=0) starterUsers,SUM(currentTier=1) basicUsers,SUM(currentTier=2) proUsers
        FROM (
          SELECT u.id,COALESCE(MAX(CASE WHEN s.status='active' AND s.starts_at<=UTC_TIMESTAMP() AND s.ends_at>UTC_TIMESTAMP() THEN CASE p.code WHEN 'pro' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END END),0) currentTier
          FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id LEFT JOIN plans p ON p.id=s.plan_id
          WHERE u.role='member' GROUP BY u.id
        ) currentMemberships
      ) tierCounts`);
    return rows[0];
  }

  async user(publicId: string): Promise<SuperAdminUserDetail | null> {
    const [rows] = await this.#pool.execute<Array<RowDataPacket & SuperAdminRecord>>(
      `SELECT u.id internalId,u.public_id publicId,u.email,u.role legacyRole,u.status,u.email_verified_at emailVerifiedAt,u.created_at createdAt,
       GROUP_CONCAT(DISTINCT r.code ORDER BY r.code) roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL
       LEFT JOIN roles r ON r.id=ur.role_id
       WHERE u.public_id=? GROUP BY u.id LIMIT 1`,
      [publicId],
    );
    const identity = rows[0];
    if (!identity) return null;
    const userId = Number(identity.internalId);
    delete identity.internalId;
    const [subscriptions, payments, usage, resume, security, audit] = await Promise.all([
      this.#records(`SELECT s.public_id publicId,p.code tier,s.status,s.starts_at startsAt,s.ends_at endsAt FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? ORDER BY s.created_at DESC`, [userId]),
      this.#records(`SELECT public_id publicId,merchant_order_id orderId,target_plan_code tier,amount,currency,status,gateway_status gatewayStatus,created_at createdAt FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, [userId]),
      this.#records(`SELECT public_id publicId,feature_key featureKey,delta_value deltaValue,reason,created_at createdAt FROM usage_adjustments WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, [userId]),
      this.#records(`SELECT r.public_id requestPublicId,e.public_id entitlementPublicId,e.beneficiary_name beneficiary,e.consumed_at consumedAt,r.status,r.revision_count revisionCount,r.retention_expires_at retentionExpiresAt FROM resume_service_entitlements e LEFT JOIN resume_requests r ON r.entitlement_id=e.id WHERE e.user_id=? ORDER BY e.created_at DESC`, [userId]),
      this.#records(`SELECT event,created_at createdAt FROM activity_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, [userId]),
      this.#records(`SELECT public_id publicId,action,entity_type entityType,previous_value_text previousValue,new_value_text newValue,reason,created_at createdAt FROM admin_interventions WHERE target_user_id=? ORDER BY created_at DESC LIMIT 100`, [userId]),
    ]);
    return { identity, subscriptions, payments, usage, resume, security, audit };
  }

  async card(publicId: string): Promise<SuperAdminRecord | null> {
    const [rows] = await this.#pool.execute<Array<RowDataPacket & SuperAdminRecord>>(
      `SELECT c.id internalCardId,c.public_id publicId,c.slug,c.slug_kind slugKind,c.plan_code planCode,
       t.code themeCode,c.locale,c.status,c.published_at publishedAt,c.created_at createdAt,c.updated_at updatedAt,
       cc.full_name fullName,cc.job_title jobTitle,cc.organization,cc.office_phone officePhone,
       cc.mobile_phone mobilePhone,cc.email contactEmail,cc.website_url websiteUrl,cc.address_text addressText,
       u.public_id ownerPublicId,u.email ownerEmail,u.status ownerStatus,u.email_verified_at ownerEmailVerifiedAt
       FROM cards c
       JOIN themes t ON t.id=c.theme_id
       JOIN card_contacts cc ON cc.card_id=c.id
       LEFT JOIN users u ON u.id=c.user_id
       WHERE c.public_id=? AND c.deleted_at IS NULL LIMIT 1`,
      [publicId],
    );
    const row = rows[0];
    if (!row) return null;
    const cardId = Number(row.internalCardId);
    const owner = row.ownerPublicId ? {
      publicId: row.ownerPublicId,
      email: row.ownerEmail,
      status: row.ownerStatus,
      emailVerifiedAt: row.ownerEmailVerifiedAt,
    } : null;
    const card: SuperAdminRecord = { ...row };
    for (const key of ['internalCardId', 'ownerPublicId', 'ownerEmail', 'ownerStatus', 'ownerEmailVerifiedAt']) delete card[key];
    const [activity, interventions] = await Promise.all([
      this.#records(
        `SELECT event,request_id requestId,created_at createdAt FROM activity_logs
         WHERE card_id=? ORDER BY created_at DESC,id DESC LIMIT 100`,
        [cardId],
      ),
      this.#records(
        `SELECT public_id publicId,action,previous_value_text previousValue,new_value_text newValue,reason,correlation_id correlationId,created_at createdAt
         FROM admin_interventions WHERE entity_type='card' AND entity_public_id=? ORDER BY created_at DESC,id DESC LIMIT 100`,
        [publicId],
      ),
    ]);
    return { card, owner, audit: [...interventions, ...activity] };
  }

  specialists(): Promise<SuperAdminRecord[]> {
    return this.#records(`SELECT u.public_id publicId,u.email,u.status,COUNT(DISTINCT CASE WHEN rr.status NOT IN ('COMPLETED','EXPIRED','CANCELLED','ARCHIVED') THEN rr.id END) active,COUNT(DISTINCT CASE WHEN rr.status='COMPLETED' THEN rr.id END) completed,AVG(CASE WHEN rr.completed_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR,rr.data_complete_at,rr.completed_at) END) averageTurnaroundHours,SUM(CASE WHEN se.event_type='BREACHED' THEN 1 ELSE 0 END) slaBreached FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL JOIN roles ro ON ro.id=ur.role_id AND ro.code='cv_specialist' LEFT JOIN resume_requests rr ON rr.assigned_specialist_id=u.id LEFT JOIN resume_request_sla_events se ON se.request_id=rr.id GROUP BY u.id,u.public_id,u.email,u.status`);
  }

  subscriptions(): Promise<SuperAdminRecord[]> {
    return this.#records(`SELECT s.public_id publicId,u.public_id userPublicId,u.email,p.code tier,s.status,s.starts_at startsAt,s.ends_at endsAt FROM subscriptions s JOIN users u ON u.id=s.user_id JOIN plans p ON p.id=s.plan_id ORDER BY s.created_at DESC LIMIT 200`);
  }

  usage(): Promise<SuperAdminRecord[]> {
    return this.#records(`SELECT a.public_id publicId,u.public_id userPublicId,u.email,a.feature_key featureKey,a.delta_value deltaValue,actor.email actor,a.reason,a.created_at createdAt FROM usage_adjustments a JOIN users u ON u.id=a.user_id JOIN users actor ON actor.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 200`);
  }

  interventions(): Promise<SuperAdminRecord[]> {
    return this.#records(`SELECT i.public_id publicId,actor.email actor,target.email target,i.action,i.entity_type entityType,i.entity_public_id entityPublicId,i.previous_value_text previousValue,i.new_value_text newValue,i.reason,i.created_at createdAt FROM admin_interventions i JOIN users actor ON actor.id=i.actor_user_id LEFT JOIN users target ON target.id=i.target_user_id ORDER BY i.created_at DESC LIMIT 200`);
  }

  settings(): Promise<SuperAdminRecord[]> {
    return this.#records(`SELECT setting_key settingKey,setting_group settingGroup,CASE WHEN classification='SECRET' THEN NULL ELSE value_text END value,classification,FALSE isEditable,updated_at updatedAt FROM website_settings ORDER BY setting_group,setting_key`);
  }

  async feedback(input: FeedbackListInput): Promise<FeedbackListResult> {
    const conditions: string[] = [];
    const values: SqlValue[] = [];
    if (input.status) {
      conditions.push('f.status=?');
      values.push(input.status);
    }
    if (input.search) {
      conditions.push('(f.message LIKE ? OR u.email LIKE ?)');
      const pattern = `%${input.search}%`;
      values.push(pattern, pattern);
    }
    if (input.from) {
      conditions.push('f.created_at>=?');
      values.push(input.from);
    }
    if (input.to) {
      conditions.push('f.created_at<=?');
      values.push(input.to);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const offset = (input.page - 1) * input.limit;
    const [countRows] = await this.#pool.execute<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) total FROM user_feedback f JOIN users u ON u.id=f.user_id${where}`,
      values,
    );
    const [rows] = await this.#pool.execute<Array<RowDataPacket & SuperAdminRecord>>(
      `SELECT f.public_id publicId,u.public_id userPublicId,u.email,f.message,f.status,
       f.created_at submittedAt,f.updated_at updatedAt
       FROM user_feedback f JOIN users u ON u.id=f.user_id${where}
       ORDER BY f.created_at DESC,f.id DESC LIMIT ? OFFSET ?`,
      [...values, input.limit, offset],
    );
    const total = Number(countRows[0]?.total ?? 0);
    return {
      items: rows.map((row) => ({ ...row })),
      pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
    };
  }

  async updateFeedbackStatus(actorPublicId: string, publicId: string, input: FeedbackStatusUpdate, correlationId: string | null): Promise<SuperAdminRecord> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const actorId = await this.#activeUserId(connection, actorPublicId);
      const [rows] = await connection.execute<Array<RowDataPacket & { id: number; user_id: number; status: string }>>(
        `SELECT id,user_id,status FROM user_feedback WHERE public_id=? FOR UPDATE`,
        [publicId],
      );
      const feedback = rows[0];
      if (!actorId || !feedback) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Feedback was not found.');
      if (feedback.status === input.status) throw new AppError(409, 'FEEDBACK_STATUS_UNCHANGED', 'Feedback already has the requested status.');
      await connection.execute(
        `UPDATE user_feedback SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,
        [input.status, feedback.id],
      );
      await connection.execute(
        `INSERT INTO admin_interventions(public_id,actor_user_id,target_user_id,action,entity_type,entity_public_id,previous_value_text,new_value_text,reason,correlation_id,created_at)
         VALUES(?,?,?,'UPDATE_FEEDBACK_STATUS','user_feedback',?,?,?,?,?,UTC_TIMESTAMP())`,
        [randomUUID(), actorId, feedback.user_id, publicId, feedback.status, input.status, input.reason, correlationId],
      );
      await connection.commit();
      return { publicId, previousStatus: feedback.status, status: input.status };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async reports(days: number): Promise<SuperAdminRecord> {
    const since = new Date(Date.now() - (days - 1) * 86_400_000);
    const [userRegistrations, feedbackByStatus, subscriptionsByTier, mailByStatus, resumeByStatus] = await Promise.all([
      this.#records(`SELECT DATE(created_at) date,COUNT(*) count FROM users WHERE created_at>=? GROUP BY DATE(created_at) ORDER BY date`, [since]),
      this.#records(`SELECT status,COUNT(*) count FROM user_feedback WHERE created_at>=? GROUP BY status ORDER BY status`, [since]),
      this.#records(
        `SELECT p.code tier,COUNT(*) count FROM subscriptions s JOIN plans p ON p.id=s.plan_id
         WHERE s.created_at>=? GROUP BY p.code ORDER BY FIELD(p.code,'starter','basic','pro')`,
        [since],
      ),
      this.#records(`SELECT status,COUNT(*) count FROM mail_outbox WHERE created_at>=? GROUP BY status ORDER BY status`, [since]),
      this.#records(`SELECT status,COUNT(*) count FROM resume_requests WHERE created_at>=? GROUP BY status ORDER BY status`, [since]),
    ]);
    return { days, generatedAt: new Date(), userRegistrations, feedbackByStatus, subscriptionsByTier, mailByStatus, resumeByStatus };
  }

  async system(): Promise<SuperAdminRecord> {
    const started = Date.now();
    const [rows] = await this.#pool.execute<Array<RowDataPacket & SuperAdminRecord>>(`SELECT
      UTC_TIMESTAMP() generatedAt,
      (SELECT COUNT(*) FROM mail_outbox WHERE status='queued') queuedMail,
      (SELECT COUNT(*) FROM mail_outbox WHERE status='processing') processingMail,
      (SELECT COUNT(*) FROM mail_outbox WHERE status='failed') failedMail,
      (SELECT COUNT(*) FROM resume_requests WHERE status NOT IN ('COMPLETED','EXPIRED','CANCELLED','ARCHIVED')) activeResumeRequests,
      (SELECT COUNT(*) FROM user_feedback WHERE status IN ('new','in_review')) openFeedback`);
    return { database: 'available', databaseLatencyMs: Date.now() - started, ...(rows[0] ?? {}) };
  }

  async security(): Promise<SuperAdminRecord> {
    const [summaryRows, rateLimits, events] = await Promise.all([
      this.#records(`SELECT
        (SELECT COUNT(*) FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at>UTC_TIMESTAMP()) activeSessions,
        (SELECT COUNT(*) FROM refresh_tokens WHERE revoked_at>=UTC_TIMESTAMP()-INTERVAL 24 HOUR) revokedSessions24Hours,
        (SELECT COUNT(*) FROM auth_rate_limits WHERE expires_at>UTC_TIMESTAMP()) activeRateLimitBuckets,
        (SELECT COUNT(*) FROM password_reset_tokens WHERE used_at IS NULL AND expires_at>UTC_TIMESTAMP()) pendingPasswordResets,
        (SELECT COUNT(*) FROM email_otps WHERE consumed_at IS NULL AND expires_at>UTC_TIMESTAMP()) pendingOtps,
        (SELECT COUNT(*) FROM users WHERE email_verified_at IS NULL) unverifiedUsers,
        (SELECT COUNT(*) FROM users WHERE status='suspended') suspendedUsers`),
      this.#records(
        `SELECT action,COUNT(*) buckets,SUM(hits) hits,MAX(updated_at) latestAt
         FROM auth_rate_limits WHERE expires_at>UTC_TIMESTAMP() GROUP BY action ORDER BY hits DESC`,
      ),
      this.#records(
        `SELECT a.event,u.email actorEmail,a.request_id requestId,a.created_at createdAt
         FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id
         WHERE a.event LIKE 'auth.%' OR a.event LIKE 'admin.%' OR a.event LIKE 'mail.%'
         ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,
      ),
    ]);
    return { summary: summaryRows[0] ?? {}, rateLimits, events };
  }

  async intervene(actorPublicId: string, targetPublicId: string, input: Intervention, correlationId: string | null): Promise<InterventionResult> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const actorId = await this.#activeUserId(connection, actorPublicId);
      const [targets] = await connection.execute<Array<RowDataPacket & { id: number; status: string }>>(
        `SELECT id,status FROM users WHERE public_id=? FOR UPDATE`,
        [targetPublicId],
      );
      if (!actorId || !targets[0]) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'User was not found.');
      const target = targets[0];
      let previousValue: string | null = null;
      let newValue: string | null = null;

      if (input.action === 'SUSPEND_USER' || input.action === 'ACTIVATE_USER') {
        previousValue = target.status;
        newValue = input.action === 'SUSPEND_USER' ? 'suspended' : 'active';
        await connection.execute(`UPDATE users SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=?`, [newValue, target.id]);
      } else if (input.action === 'GRANT_ROLE') {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO user_roles(user_id,role_id,granted_by_user_id,granted_at)
           SELECT ?,id,?,UTC_TIMESTAMP() FROM roles WHERE code=?
           ON DUPLICATE KEY UPDATE revoked_at=NULL,granted_by_user_id=VALUES(granted_by_user_id),granted_at=VALUES(granted_at)`,
          [target.id, actorId, input.roleCode!],
        );
        if (result.affectedRows === 0) throw new AppError(422, 'INVALID_ROLE', 'Role is not recognized.');
        await connection.execute(
          `UPDATE users u SET u.role=(SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND ur.revoked_at IS NULL ORDER BY FIELD(r.code,'super_admin','resume_service_admin','cv_specialist','member') LIMIT 1),u.updated_at=UTC_TIMESTAMP() WHERE u.id=?`,
          [target.id],
        );
        previousValue = 'not_granted';
        newValue = input.roleCode ?? null;
      } else if (input.action === 'EXTEND_SUBSCRIPTION') {
        const [subscriptions] = await connection.execute<Array<RowDataPacket & { id: number; ends_at: Date }>>(
          `SELECT id,ends_at FROM subscriptions WHERE user_id=? AND status='active' ORDER BY ends_at DESC LIMIT 1 FOR UPDATE`,
          [target.id],
        );
        if (!subscriptions[0]) throw new AppError(409, 'RESOURCE_NOT_FOUND', 'Active subscription was not found.');
        previousValue = subscriptions[0].ends_at.toISOString();
        await connection.execute(`UPDATE subscriptions SET ends_at=DATE_ADD(ends_at,INTERVAL ? DAY),updated_at=UTC_TIMESTAMP() WHERE id=?`, [input.days!, subscriptions[0].id]);
        newValue = `+${input.days} days`;
      } else {
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE resume_service_entitlements SET consumed_at=NULL,beneficiary_name=NULL,beneficiary_name_normalized=NULL,updated_at=UTC_TIMESTAMP()
           WHERE user_id=? AND id=(SELECT id FROM (SELECT id FROM resume_service_entitlements WHERE user_id=? ORDER BY created_at DESC LIMIT 1) x)`,
          [target.id, target.id],
        );
        if (result.affectedRows === 0) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Resume entitlement was not found.');
        previousValue = 'consumed';
        newValue = 'reset';
      }

      await connection.execute(
        `INSERT INTO admin_interventions(public_id,actor_user_id,target_user_id,action,entity_type,entity_public_id,previous_value_text,new_value_text,reason,correlation_id,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())`,
        [randomUUID(), actorId, target.id, input.action, 'user', targetPublicId, previousValue, newValue, input.reason, correlationId],
      );
      await connection.commit();
      return { action: input.action, previousValue, newValue };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async interveneCard(actorPublicId: string, cardPublicId: string, input: CardIntervention, correlationId: string | null): Promise<CardInterventionResult> {
    const connection = await this.#pool.getConnection();
    try {
      await connection.beginTransaction();
      const actorId = await this.#activeUserId(connection, actorPublicId);
      const [cards] = await connection.execute<Array<RowDataPacket & {
        id: number;
        user_id: number | null;
        owner_public_id: string | null;
        contact_email: string;
      }>>(
        `SELECT c.id,c.user_id,u.public_id owner_public_id,cc.email contact_email
         FROM cards c JOIN card_contacts cc ON cc.card_id=c.id LEFT JOIN users u ON u.id=c.user_id
         WHERE c.public_id=? AND c.deleted_at IS NULL AND c.status<>'deleted' FOR UPDATE`,
        [cardPublicId],
      );
      const card = cards[0];
      if (!actorId || !card) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Card was not found.');
      const previousOwnerPublicId = card.owner_public_id;
      let newOwnerPublicId: string | null = previousOwnerPublicId;
      let targetUserId = card.user_id;

      if (input.action === 'CONNECT_MATCHING_VERIFIED_ACCOUNT') {
        if (card.user_id !== null) throw new AppError(409, 'CARD_ALREADY_CONNECTED', 'Card is already connected to an account.');
        const [users] = await connection.execute<Array<RowDataPacket & { id: number; public_id: string }>>(
          `SELECT id,public_id FROM users
           WHERE LOWER(email)=LOWER(?) AND status='active' AND email_verified_at IS NOT NULL
           LIMIT 1 FOR UPDATE`,
          [card.contact_email],
        );
        const user = users[0];
        if (!user) throw new AppError(409, 'MATCHING_VERIFIED_ACCOUNT_NOT_FOUND', 'A matching active and verified account was not found.');
        const [owned] = await connection.execute<Array<RowDataPacket & { id: number }>>(
          `SELECT id FROM cards WHERE user_id=? AND deleted_at IS NULL AND status<>'deleted' AND id<>? LIMIT 1 FOR UPDATE`,
          [user.id, card.id],
        );
        if (owned[0]) throw new AppError(409, 'PLAN_LIMIT_REACHED', 'The matching account already has an active card.');
        await connection.execute(`UPDATE cards SET user_id=?,updated_at=UTC_TIMESTAMP() WHERE id=?`, [user.id, card.id]);
        await connection.execute(
          `UPDATE starter_manage_tokens SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP()) WHERE card_id=?`,
          [card.id],
        );
        targetUserId = user.id;
        newOwnerPublicId = user.public_id;
      } else {
        if (card.user_id === null) throw new AppError(409, 'CARD_NOT_CONNECTED', 'Card is not connected to an account.');
        await connection.execute(`UPDATE cards SET user_id=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?`, [card.id]);
        newOwnerPublicId = null;
      }

      await connection.execute(
        `INSERT INTO admin_interventions(public_id,actor_user_id,target_user_id,action,entity_type,entity_public_id,previous_value_text,new_value_text,reason,correlation_id,created_at)
         VALUES(?,?,?,?, 'card',?,?,?,?,?,UTC_TIMESTAMP())`,
        [randomUUID(), actorId, targetUserId, input.action, cardPublicId, previousOwnerPublicId, newOwnerPublicId, input.reason, correlationId],
      );
      await connection.execute(
        `INSERT INTO activity_logs(user_id,card_id,event,request_id,metadata_text,created_at)
         VALUES(?,?,?,?,?,UTC_TIMESTAMP())`,
        [actorId, card.id, `admin.card.${input.action.toLowerCase()}`, correlationId, JSON.stringify({ cardPublicId, previousOwnerPublicId, newOwnerPublicId })],
      );
      await connection.commit();
      return { action: input.action, previousOwnerPublicId, newOwnerPublicId };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async #records(sql: string, values: readonly SqlValue[] = []): Promise<SuperAdminRecord[]> {
    const [rows] = await this.#pool.execute<Array<RowDataPacket & SuperAdminRecord>>(sql, [...values]);
    return rows;
  }

  async #activeUserId(connection: Connection, publicId: string): Promise<number | null> {
    const [rows] = await connection.execute<Array<RowDataPacket & { id: number }>>(
      `SELECT id FROM users WHERE public_id=? AND status='active' FOR UPDATE`,
      [publicId],
    );
    return rows[0]?.id ?? null;
  }
}
