import type { Pool, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../../../shared/http/errors.ts';
import { landingContentDefaults, landingContentSchema, type LandingContent } from '../dto/landing-content.ts';
import type { LandingContentRepository } from './landing-content-repository.ts';

const settingKey = 'landing_page.wording';

export class MySqlLandingContentRepository implements LandingContentRepository {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async read(): Promise<LandingContent> {
    const [rows] = await this.pool.execute<Array<RowDataPacket & { value_text: string | null }>>('SELECT value_text FROM website_settings WHERE setting_key=? LIMIT 1', [settingKey]);
    return this.#parse(rows[0]?.value_text);
  }

  async update(actorPublicId: string, content: LandingContent, reason: string): Promise<{ updatedAt: string }> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [actors] = await connection.execute<Array<RowDataPacket & { id: number }>>('SELECT id FROM users WHERE public_id=? AND status=\'active\' FOR UPDATE', [actorPublicId]);
      const actorId = actors[0]?.id;
      if (!actorId) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
      const [settings] = await connection.execute<Array<RowDataPacket & { id: number; value_text: string | null }>>('SELECT id,value_text FROM website_settings WHERE setting_key=? FOR UPDATE', [settingKey]);
      const setting = settings[0];
      if (!setting) throw new AppError(500, 'LANDING_CONTENT_UNAVAILABLE', 'Landing content configuration is unavailable.');
      const nextValue = JSON.stringify(content);
      await connection.execute('UPDATE website_settings SET value_text=?,updated_by_user_id=?,updated_at=UTC_TIMESTAMP() WHERE id=?', [nextValue, actorId, setting.id]);
      await connection.execute('INSERT INTO setting_change_logs(setting_id,actor_user_id,previous_value_text,new_value_text,reason,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())', [setting.id, actorId, setting.value_text, nextValue, reason]);
      await connection.execute('INSERT INTO activity_logs(user_id,event,metadata_text,created_at) VALUES(?,?,?,UTC_TIMESTAMP())', [actorId, 'landing_page.wording.updated', JSON.stringify({ settingKey })]);
      await connection.commit();
      return { updatedAt: new Date().toISOString() };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  #parse(value: string | null | undefined): LandingContent {
    if (!value) return { ...landingContentDefaults };
    try {
      const parsed = landingContentSchema.safeParse(JSON.parse(value));
      return parsed.success ? parsed.data : { ...landingContentDefaults };
    } catch { return { ...landingContentDefaults }; }
  }
}
