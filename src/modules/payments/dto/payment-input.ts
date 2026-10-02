import { z } from 'zod';

export const checkoutInputSchema = z.object({ planCode: z.enum(['basic', 'pro']) }).strict();
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
