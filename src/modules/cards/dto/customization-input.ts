import { z } from 'zod';
export const slugInputSchema=z.object({slug:z.string().min(3).max(100)}).strict();
export const themeInputSchema=z.object({themeCode:z.string().min(1).max(50)}).strict();
export const suggestionQuerySchema=z.object({fullName:z.string().max(150),mobilePhone:z.string().max(32)}).strict();
