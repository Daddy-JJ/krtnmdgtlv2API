import { z } from 'zod';

export const feedbackInputSchema = z.object({
  message: z.string().trim().min(1, 'Feedback is required.').max(300, 'Feedback must not exceed 300 characters.'),
}).strict();

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
