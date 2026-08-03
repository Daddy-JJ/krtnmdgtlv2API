import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CatalogInput, SocialInput } from '../dto/content-input.ts';
import type { CardContentRepository, CatalogItem, SocialLink } from './card-content-repository.ts';

type SocialRow = RowDataPacket & { id: number; platform: SocialInput['platform']; url: string; sort_order: number };
type CatalogRow = RowDataPacket & { public_id: string; title: string; description: string | null; target_url: string | null; sort_order: number; is_published: number };
const social = (row: SocialRow): SocialLink => ({ id: row.id, platform: row.platform, url: row.url, sortOrder: row.sort_order });
const catalog = (row: CatalogRow): CatalogItem => ({ publicId: row.public_id, title: row.title, description: row.description, targetUrl: row.target_url, sortOrder: row.sort_order, isPublished: row.is_published === 1 });

export class MySqlCardContentRepository implements CardContentRepository {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async #transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.#pool.getConnection();
    try { await connection.beginTransaction(); const value = await work(connection); await connection.commit(); return value; }
    catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  async #lock(connection: PoolConnection, userId: string, cardId: string): Promise<number | null> {
    const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(`SELECT ca.id FROM cards ca JOIN users u ON u.id=ca.user_id WHERE u.public_id=? AND ca.public_id=? AND ca.deleted_at IS NULL AND ca.status<>'deleted' LIMIT 1 FOR UPDATE`, [userId, cardId]);
    return rows[0]?.id ?? null;
  }

  async listSocial(userId: string, cardId: string): Promise<SocialLink[] | null> {
    const [rows] = await this.#pool.execute<SocialRow[]>(`SELECT s.id,s.platform,s.url,s.sort_order FROM card_social_links s JOIN cards c ON c.id=s.card_id JOIN users u ON u.id=c.user_id WHERE u.public_id=? AND c.public_id=? AND c.deleted_at IS NULL ORDER BY s.sort_order,s.id`, [userId, cardId]);
    if (rows.length === 0) { const [owned] = await this.#pool.execute<RowDataPacket[]>(`SELECT c.id FROM cards c JOIN users u ON u.id=c.user_id WHERE u.public_id=? AND c.public_id=? AND c.deleted_at IS NULL LIMIT 1`, [userId, cardId]); if (owned.length === 0) return null; }
    return rows.map(social);
  }

  async listPublishedSocial(slug: string, limit: number): Promise<SocialLink[]> {
    if (limit === 0) return [];
    const [rows] = await this.#pool.execute<SocialRow[]>(`SELECT s.id,s.platform,s.url,s.sort_order FROM card_social_links s JOIN cards c ON c.id=s.card_id WHERE c.slug=? AND c.status='published' AND c.deleted_at IS NULL ORDER BY s.sort_order,s.id LIMIT ?`, [slug, limit]);
    return rows.map(social);
  }

  async createSocial(userId: string, cardId: string, input: SocialInput, limit: number, now: Date) {
    return this.#transaction(async connection => { const id = await this.#lock(connection, userId, cardId); if (!id) return null; const [rows] = await connection.execute<(RowDataPacket & { count: number })[]>(`SELECT COUNT(*) count FROM card_social_links WHERE card_id=?`, [id]); if (Number(rows[0]?.count) >= limit) return 'limit'; const [result] = await connection.execute<ResultSetHeader>(`INSERT INTO card_social_links(card_id,platform,url,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)`, [id, input.platform, input.url, input.sortOrder, now, now]); return { id: result.insertId, ...input }; });
  }

  async updateSocial(userId: string, cardId: string, id: number, input: SocialInput, now: Date): Promise<SocialLink | null> {
    const [result] = await this.#pool.execute<ResultSetHeader>(`UPDATE card_social_links s JOIN cards c ON c.id=s.card_id JOIN users u ON u.id=c.user_id SET s.platform=?,s.url=?,s.sort_order=?,s.updated_at=? WHERE u.public_id=? AND c.public_id=? AND s.id=? AND c.deleted_at IS NULL`, [input.platform, input.url, input.sortOrder, now, userId, cardId, id]);
    return result.affectedRows === 1 ? { id, ...input } : null;
  }

  async deleteSocial(userId: string, cardId: string, id: number): Promise<boolean> {
    const [result] = await this.#pool.execute<ResultSetHeader>(`DELETE s FROM card_social_links s JOIN cards c ON c.id=s.card_id JOIN users u ON u.id=c.user_id WHERE u.public_id=? AND c.public_id=? AND s.id=? AND c.deleted_at IS NULL`, [userId, cardId, id]);
    return result.affectedRows === 1;
  }

  async listCatalog(userId: string, cardId: string): Promise<CatalogItem[] | null> {
    const [rows] = await this.#pool.execute<CatalogRow[]>(`SELECT i.public_id,i.title,i.description,i.target_url,i.sort_order,i.is_published FROM catalog_items i JOIN cards c ON c.id=i.card_id JOIN users u ON u.id=c.user_id WHERE u.public_id=? AND c.public_id=? AND c.deleted_at IS NULL ORDER BY i.sort_order,i.id`, [userId, cardId]);
    if (rows.length === 0) { const [owned] = await this.#pool.execute<RowDataPacket[]>(`SELECT c.id FROM cards c JOIN users u ON u.id=c.user_id WHERE u.public_id=? AND c.public_id=? AND c.deleted_at IS NULL LIMIT 1`, [userId, cardId]); if (owned.length === 0) return null; }
    return rows.map(catalog);
  }

  async listPublishedCatalog(slug: string, limit: number): Promise<CatalogItem[]> {
    if (limit === 0) return [];
    const [rows] = await this.#pool.execute<CatalogRow[]>(`SELECT i.public_id,i.title,i.description,i.target_url,i.sort_order,i.is_published FROM catalog_items i JOIN cards c ON c.id=i.card_id WHERE c.slug=? AND c.status='published' AND c.deleted_at IS NULL AND i.is_published=1 ORDER BY i.sort_order,i.id LIMIT ?`, [slug, limit]);
    return rows.map(catalog);
  }

  async createCatalog(userId: string, cardId: string, input: CatalogInput, limit: number, publicId: string, now: Date) {
    return this.#transaction(async connection => { const id = await this.#lock(connection, userId, cardId); if (!id) return null; const [rows] = await connection.execute<(RowDataPacket & { count: number })[]>(`SELECT COUNT(*) count FROM catalog_items WHERE card_id=?`, [id]); if (Number(rows[0]?.count) >= limit) return 'limit'; await connection.execute(`INSERT INTO catalog_items(public_id,card_id,title,description,target_url,sort_order,is_published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`, [publicId, id, input.title, input.description, input.targetUrl, input.sortOrder, input.isPublished, now, now]); return { publicId, ...input }; });
  }

  async updateCatalog(userId: string, cardId: string, itemId: string, input: CatalogInput, now: Date): Promise<CatalogItem | null> {
    const [result] = await this.#pool.execute<ResultSetHeader>(`UPDATE catalog_items i JOIN cards c ON c.id=i.card_id JOIN users u ON u.id=c.user_id SET i.title=?,i.description=?,i.target_url=?,i.sort_order=?,i.is_published=?,i.updated_at=? WHERE u.public_id=? AND c.public_id=? AND i.public_id=? AND c.deleted_at IS NULL`, [input.title, input.description, input.targetUrl, input.sortOrder, input.isPublished, now, userId, cardId, itemId]);
    return result.affectedRows === 1 ? { publicId: itemId, ...input } : null;
  }

  async deleteCatalog(userId: string, cardId: string, itemId: string): Promise<boolean> {
    const [result] = await this.#pool.execute<ResultSetHeader>(`DELETE i FROM catalog_items i JOIN cards c ON c.id=i.card_id JOIN users u ON u.id=c.user_id WHERE u.public_id=? AND c.public_id=? AND i.public_id=? AND c.deleted_at IS NULL`, [userId, cardId, itemId]);
    return result.affectedRows === 1;
  }
}
