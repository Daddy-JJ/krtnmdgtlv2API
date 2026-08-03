import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(190));
const password = z.string().min(8).max(128);

export const registerInputSchema = z.object({ email, password }).strict();
export const loginInputSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const verifyOtpInputSchema = z.object({ email, code: z.string().regex(/^[0-9]{6}$/) }).strict();
export const resendOtpInputSchema = z.object({ email }).strict();
export const forgotPasswordInputSchema = z.object({ email }).strict();
export const resetPasswordInputSchema = z.object({ token: z.string().min(32).max(512), password }).strict();

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
