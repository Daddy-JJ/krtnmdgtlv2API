import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(190));

export const updateCurrentUserInputSchema = z.object({ email, currentPassword: z.string().min(1).max(128) }).strict();
export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserInputSchema>;
