import { z } from 'zod';

const httpUrl = z.url().max(500).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Only HTTP(S) URLs are allowed.');

export const cardInputSchema = z.object({
  locale: z.enum(['id', 'en']).default('id'),
  contact: z.object({
    fullName: z.string().trim().min(1).max(150),
    jobTitle: z.string().trim().max(120),
    organization: z.string().trim().max(150),
    officePhone: z.string().trim().max(32),
    mobilePhone: z.string().trim().max(32),
    email: z.string().trim().toLowerCase().pipe(z.email().max(190)),
    websiteUrl: httpUrl,
    addressText: z.string().trim().max(1000),
    mapsUrl: httpUrl.nullable().optional().transform((value) => value ?? null),
  }).strict(),
}).strict();

export type CardInput = z.input<typeof cardInputSchema>;
export type NormalizedCardInput = z.output<typeof cardInputSchema>;
