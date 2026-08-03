import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { PlanCatalogRepository, PublicPlan } from './plan-catalog-repository.ts';

export class MySqlPlanCatalogRepository implements PlanCatalogRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async listActivePlans(): Promise<PublicPlan[]> {
    const [plans] = await this.#pool.execute<Array<RowDataPacket & {
      id: number;
      code: 'starter' | 'basic' | 'pro';
      name: string;
      price_amount: number | string;
      duration_days: number;
    }>>(
      `SELECT id, code, name, price_amount, duration_days
       FROM plans
       WHERE is_active = 1
       ORDER BY FIELD(code, 'starter', 'basic', 'pro')`
    );

    if (plans.length === 0) return [];

    const [features] = await this.#pool.execute<Array<RowDataPacket & {
      plan_id: number;
      feature_key: string;
      value_type: 'bool' | 'int' | 'text';
      value_bool: number | null;
      value_int: number | null;
      value_text: string | null;
    }>>(
      `SELECT pf.plan_id, pf.feature_key, pf.value_type, pf.value_bool, pf.value_int, pf.value_text
       FROM plan_features pf
       JOIN plans p ON p.id = pf.plan_id
       WHERE p.is_active = 1
       ORDER BY pf.feature_key`
    );

    return plans.map((plan) => {
      const values: Record<string, boolean | number | string> = {};
      for (const feature of features.filter((item) => item.plan_id === plan.id)) {
        values[feature.feature_key] = feature.value_type === 'bool'
          ? feature.value_bool === 1
          : feature.value_type === 'int'
            ? Number(feature.value_int)
            : feature.value_text ?? '';
      }

      return {
        code: plan.code,
        name: plan.name,
        price: Number(plan.price_amount),
        durationDays: plan.duration_days,
        features: values,
      };
    });
  }
}
