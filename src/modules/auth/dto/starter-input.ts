import { z } from 'zod';

const httpUrl = z.url().max(500).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, 'Only HTTP(S) URLs are allowed.');

export const starterCardInputSchema = z.object({
  locale: z.enum(['id', 'en']).default('id'),
  contact: z.object({
    fullName: z.string().min(1).max(150).trim(),
    jobTitle: z.string().max(120).trim(),
    organization: z.string().max(150).trim(),
    officePhone: z.string().max(32).trim(),
    mobilePhone: z.string().max(32).trim(),
    email: z.string().trim().toLowerCase().pipe(z.email().max(190)),
    websiteUrl: httpUrl,
    addressText: z.string().max(1000).trim(),
  }).strict(),
}).strict();

export type StarterCardInput = z.infer<typeof starterCardInputSchema>;
