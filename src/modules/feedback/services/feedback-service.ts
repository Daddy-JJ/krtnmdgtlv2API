import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/http/errors.ts';
import type { FeedbackRepository } from '../repositories/feedback-repository.ts';

export class FeedbackService {
  readonly #repository: FeedbackRepository;
  constructor(repository: FeedbackRepository) { this.#repository = repository; }

  async submit(userPublicId: string, message: string): Promise<{ publicId: string; status: 'new' }> {
    const publicId = randomUUID();
    const created = await this.#repository.create(userPublicId, publicId, message, new Date());
    if (!created) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    return { publicId, status: 'new' };
  }
}
