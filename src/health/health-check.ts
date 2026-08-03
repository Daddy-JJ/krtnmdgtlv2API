import type { Pool, RowDataPacket } from 'mysql2/promise';

export type HealthResult = Readonly<{ healthy: boolean; latencyMs: number }>;

export interface HealthCheck {
  check(): Promise<HealthResult>;
}

export class DatabaseHealthCheck implements HealthCheck {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async check(): Promise<HealthResult> {
    const startedAt = performance.now();
    let healthy = false;

    try {
      const [rows] = await this.#pool.execute<Array<RowDataPacket & { value: number }>>('SELECT 1 AS value');
      healthy = rows[0]?.value === 1;
    } catch {
      healthy = false;
    }

    return { healthy, latencyMs: Math.round(performance.now() - startedAt) };
  }
}
