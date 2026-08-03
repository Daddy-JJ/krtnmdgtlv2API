import { z } from 'zod';

export const checkoutInputSchema = z.object({ planCode: z.enum(['basic', 'pro']) }).strict();
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const midtransNotificationSchema = z.object({
  order_id: z.string().min(1).max(100),
  status_code: z.string().regex(/^\d{3}$/),
  gross_amount: z.string().regex(/^\d+(?:\.\d{2})$/),
  signature_key: z.string().regex(/^[a-fA-F0-9]{128}$/),
  transaction_status: z.string().min(1).max(50),
  transaction_id: z.string().min(1).max(150).optional(),
  fraud_status: z.string().min(1).max(50).optional(),
}).passthrough();
export type MidtransNotification = z.infer<typeof midtransNotificationSchema>;
