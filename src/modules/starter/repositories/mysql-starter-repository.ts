import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { StarterCardInput } from '../../auth/dto/starter-input.ts';
import type { ClaimUserRecord, ManagedStarterRecord, StarterCardRecord, StarterRepository, StarterTransaction } from './starter-repository.ts';

type CardRow = RowDataPacket & { id: number; public_id: string; user_id: number | null; slug: string; plan_code: 'starter'; theme_code: string; locale: 'id' | 'en'; status: string; full_name: string; job_title: string; organization: string; office_phone: string; mobile_phone: string; email: string; website_url: string; address_text: string };

function card(row: CardRow): StarterCardRecord {
  return { id: row.id, publicId: row.public_id, userId: row.user_id, slug: row.slug, planCode: row.plan_code, themeCode: row.theme_code, locale: row.locale, status: row.status, contact: { fullName: row.full_name, jobTitle: row.job_title, organization: row.organization, officePhone: row.office_phone, mobilePhone: row.mobile_phone, email: row.email, websiteUrl: row.website_url, addressText: row.address_text } };
}

class MySqlStarterTransaction implements StarterTransaction {
  readonly #connection: PoolConnection;
  constructor(connection: PoolConnection) { this.#connection = connection; }

  async slugExists(slug: string): Promise<boolean> {
    const [rows] = await this.#connection.execute<RowDataPacket[]>('SELECT id FROM cards WHERE slug = BINARY ? LIMIT 1', [slug]);
    return rows.length > 0;
  }

  async insertStarter(input: { publicId: string; slug: string; tokenHash: string; data: StarterCardInput; now: Date }): Promise<StarterCardRecord> {
    const [themes] = await this.#connection.execute<Array<RowDataPacket & { id: number }>>(`SELECT t.id FROM themes t
      JOIN plan_theme_access pta ON pta.theme_id = t.id JOIN plans p ON p.id = pta.plan_id
      WHERE t.code = 'starter-clean' AND t.is_active = 1 AND p.code = 'starter' AND p.is_active = 1 LIMIT 1 FOR UPDATE`);
    const themeId = themes[0]?.id;
    if (!themeId) throw new Error('Starter theme is unavailable.');
    const [result] = await this.#connection.execute<ResultSetHeader>(`INSERT INTO cards
      (public_id, user_id, slug, slug_kind, plan_code, theme_id, locale, status, created_at, updated_at)
      VALUES (?, NULL, ?, 'random', 'starter', ?, ?, 'published', ?, ?)`, [input.publicId, input.slug, themeId, input.data.locale, input.now, input.now]);
    const contact = input.data.contact;
    await this.#connection.execute(`INSERT INTO card_contacts
      (card_id, full_name, job_title, organization, office_phone, mobile_phone, email, website_url, address_text, maps_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`, [result.insertId, contact.fullName, contact.jobTitle, contact.organization, contact.officePhone, contact.mobilePhone, contact.email, contact.websiteUrl, contact.addressText, input.now, input.now]);
    await this.#connection.execute('INSERT INTO starter_manage_tokens (card_id, token_hash, created_at) VALUES (?, ?, ?)', [result.insertId, input.tokenHash, input.now]);
    return this.loadCard(result.insertId);
  }

  async findManaged(publicId: string, tokenHash: string): Promise<ManagedStarterRecord | null> {
    const [rows] = await this.#connection.execute<Array<RowDataPacket & { token_id: number; token_hash: string; card_id: number }>>(`SELECT smt.id AS token_id, smt.token_hash, c.id AS card_id FROM starter_manage_tokens smt
      JOIN cards c ON c.id = smt.card_id WHERE c.public_id = ? AND smt.token_hash = ? AND smt.revoked_at IS NULL
      AND c.user_id IS NULL AND c.plan_code = 'starter' AND c.deleted_at IS NULL FOR UPDATE`, [publicId, tokenHash]);
    const row = rows[0];
    return row ? { tokenId: row.token_id, tokenHash: row.token_hash, card: await this.loadCard(row.card_id) } : null;
  }

  async updateStarter(cardId: number, data: StarterCardInput, now: Date): Promise<void> {
    await this.#connection.execute('UPDATE cards SET locale = ?, updated_at = ? WHERE id = ?', [data.locale, now, cardId]);
    const contact = data.contact;
    await this.#connection.execute(`UPDATE card_contacts SET full_name = ?, job_title = ?, organization = ?, office_phone = ?, mobile_phone = ?, email = ?, website_url = ?, address_text = ?, maps_url = NULL, updated_at = ? WHERE card_id = ?`, [contact.fullName, contact.jobTitle, contact.organization, contact.officePhone, contact.mobilePhone, contact.email, contact.websiteUrl, contact.addressText, now, cardId]);
  }

  async rotateManageToken(cardId: number, currentTokenId: number, newTokenHash: string, now: Date): Promise<void> {
    await this.#connection.execute('UPDATE starter_manage_tokens SET last_used_at = ?, revoked_at = ? WHERE id = ?', [now, now, currentTokenId]);
    await this.#connection.execute('INSERT INTO starter_manage_tokens (card_id, token_hash, created_at) VALUES (?, ?, ?)', [cardId, newTokenHash, now]);
  }

  async findUser(publicId: string): Promise<ClaimUserRecord | null> {
    const [rows] = await this.#connection.execute<Array<RowDataPacket & { id: number; public_id: string; status: string; email_verified_at: Date | null }>>('SELECT id, public_id, status, email_verified_at FROM users WHERE public_id = ? FOR UPDATE', [publicId]);
    const row = rows[0];
    return row ? { id: row.id, publicId: row.public_id, status: row.status, emailVerifiedAt: row.email_verified_at } : null;
  }

  async userHasCard(userId: number): Promise<boolean> {
    const [rows] = await this.#connection.execute<RowDataPacket[]>('SELECT id FROM cards WHERE user_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE', [userId]);
    return rows.length > 0;
  }

  async claimCard(cardId: number, userId: number, now: Date): Promise<void> { await this.#connection.execute('UPDATE cards SET user_id = ?, updated_at = ? WHERE id = ? AND user_id IS NULL', [userId, now, cardId]); }
  async revokeManageTokens(cardId: number, now: Date): Promise<void> { await this.#connection.execute('UPDATE starter_manage_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE card_id = ?', [now, cardId]); }

  async loadCard(cardId: number): Promise<StarterCardRecord> {
    const [rows] = await this.#connection.execute<CardRow[]>(`SELECT c.id, c.public_id, c.user_id, c.slug, c.plan_code, t.code AS theme_code, c.locale, c.status,
      cc.full_name, cc.job_title, cc.organization, cc.office_phone, cc.mobile_phone, cc.email, cc.website_url, cc.address_text
      FROM cards c JOIN themes t ON t.id = c.theme_id JOIN card_contacts cc ON cc.card_id = c.id WHERE c.id = ?`, [cardId]);
    if (!rows[0]) throw new Error('Card could not be loaded.');
    return card(rows[0]);
  }
}

export class MySqlStarterRepository implements StarterRepository {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }
  async transaction<T>(work: (transaction: StarterTransaction) => Promise<T>): Promise<T> {
    const connection = await this.#pool.getConnection();
    try { await connection.beginTransaction(); const result = await work(new MySqlStarterTransaction(connection)); await connection.commit(); return result; }
    catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
}
