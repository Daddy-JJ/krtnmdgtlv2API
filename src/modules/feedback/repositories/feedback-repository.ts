export interface FeedbackRepository {
  create(userPublicId: string, publicId: string, message: string, now: Date): Promise<boolean>;
}
