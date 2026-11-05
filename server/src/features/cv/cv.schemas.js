import { z } from 'zod';

const tag = z.string().trim().toLowerCase().min(1).max(60);
const tagList = z.array(tag).max(100).transform((items) => [...new Set(items)]);

// strictObject: unknown fields (like userId or textEnc) are rejected, never saved.
export const updateCvSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    skills: tagList.optional(),
    keywords: tagList.optional(),
    domains: tagList.optional(),
    yearsExp: z.number().min(0).max(60).optional(),
    level: z.enum(['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'UNKNOWN']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Send at least one field to change',
  });
