import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { CapabilityValue, PlanCapabilityReader } from './plan-capability-service.ts';

type FeatureRow = RowDataPacket & { value_type: string; value_bool: number | null; value_int: number | null; value_text: string | null };

export class MySqlPlanCapabilityReader implements PlanCapabilityReader {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }

  async get(planCode: string, featureKey: string): Promise<CapabilityValue | null> {
    const [rows] = await this.#pool.execute<FeatureRow[]>(
      `SELECT pf.value_type, pf.value_bool, pf.value_int, pf.value_text
       FROM plan_features pf JOIN plans p ON p.id = pf.plan_id
       WHERE p.code = ? AND p.is_active = 1 AND pf.feature_key = ? LIMIT 1`,
      [planCode, featureKey],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.value_type === 'bool') return row.value_bool === 1;
    if (row.value_type === 'int') return row.value_int;
    if (row.value_type === 'text') return row.value_text;
    return null;
  }
}
