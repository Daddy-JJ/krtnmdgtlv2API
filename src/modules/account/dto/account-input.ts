import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(190));

export const updateCurrentUserInputSchema = z.object({ email }).strict();
export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserInputSchema>;
