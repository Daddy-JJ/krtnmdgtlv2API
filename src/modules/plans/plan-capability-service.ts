import { AppError } from '../../shared/http/errors.ts';

export type CapabilityValue = boolean | number | string;

export interface PlanCapabilityReader {
  get(planCode: string, featureKey: string): Promise<CapabilityValue | null>;
}

export class PlanCapabilityService {
  readonly #reader: PlanCapabilityReader;

  constructor(reader: PlanCapabilityReader) { this.#reader = reader; }

  async isEnabled(planCode: string, featureKey: string): Promise<boolean> {
    return await this.#reader.get(planCode, featureKey) === true;
  }

  async getLimit(planCode: string, featureKey: string): Promise<number> {
    const value = await this.#reader.get(planCode, featureKey);
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new AppError(500, 'CAPABILITY_CONFIG_INVALID', 'Plan capability configuration is invalid.');
    }
    return value;
  }

  async assertEnabled(planCode: string, featureKey: string): Promise<void> {
    if (!await this.isEnabled(planCode, featureKey)) {
      throw new AppError(403, 'CAPABILITY_NOT_AVAILABLE', 'This feature is not available for the current plan.');
    }
  }

  async assertWithinLimit(planCode: string, featureKey: string, currentCount: number, increment = 1): Promise<void> {
    const limit = await this.getLimit(planCode, featureKey);
    if (currentCount < 0 || increment < 0 || currentCount + increment > limit) {
      throw new AppError(409, 'PLAN_LIMIT_REACHED', 'The plan limit has been reached.');
    }
  }
}
