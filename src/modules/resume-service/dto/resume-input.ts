import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
export const resumeRequestInput = z.object({
  beneficiaryName: z.string().trim().min(2).max(200),
  whatsappNumber: z.string().trim().min(7).max(32),
  currentJobTitle: z.string().trim().min(2).max(150),
  currentOrganization: optionalText(200),
  experienceYears: z.number().min(0).max(80).optional().nullable(),
  careerLevel: z.enum(['Entry Level','Staff','Supervisor','Manager','Senior Manager','Director','Executive']),
  targetRole: z.string().trim().min(2).max(150),
  targetIndustry: z.string().trim().min(2).max(150),
  targetCompany: optionalText(200),
  targetCountry: z.string().trim().min(2).max(100),
  resumeLanguage: z.enum(['Indonesian','English']),
  resumeStyle: z.enum(['ATS-Friendly','Professional','Executive','Sales and Commercial','Technical','General Corporate']),
  linkedinUrl: z.url().max(500).refine((value) => value.startsWith('https://'), 'HTTPS URL required').optional().nullable(),
  pastedResumeText: optionalText(30_000),
  pastedJobDescription: optionalText(20_000),
  additionalAchievements: optionalText(10_000),
  certifications: optionalText(10_000),
  userNotes: optionalText(10_000),
  consents: z.object({
    accurate: z.literal(true),
    specialistAccess: z.literal(true),
    noFiction: z.literal(true),
    userReview: z.literal(true),
    retention: z.literal(true),
  }),
}).strict();

export const resumeRevisionInput = z.object({ notes: z.string().trim().min(10).max(10_000) }).strict();
export const resumeMessageInput = z.object({ message: z.string().trim().min(1).max(10_000) }).strict();
export const resumeAssignInput = z.object({ specialistPublicId: z.uuid(), reason: z.string().trim().min(10).max(1000) }).strict();
export const resumeTransitionInput = z.object({ reason: z.string().trim().min(1).max(1000).optional() }).strict();

export type ResumeRequestInput = z.infer<typeof resumeRequestInput>;
