import{z}from'zod';const http=z.url().max(500).refine(value=>['http:','https:'].includes(new URL(value).protocol),'Only HTTP(S) URLs are allowed.');
export const socialInputSchema=z.object({platform:z.enum(['instagram','facebook','linkedin','youtube','tiktok','x','other']),url:http,sortOrder:z.number().int().min(0).max(100000).default(0)}).strict();
export const catalogInputSchema=z.object({title:z.string().trim().min(1).max(150),description:z.string().trim().max(2000).nullable().default(null),targetUrl:http.nullable().default(null),sortOrder:z.number().int().min(0).max(100000).default(0),isPublished:z.boolean().default(true)}).strict();
export type SocialInput=z.infer<typeof socialInputSchema>;export type CatalogInput=z.infer<typeof catalogInputSchema>;
