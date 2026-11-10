import { z } from 'zod';

// UNKNOWN is allowed: many jobs do not say their level, and you may want to list just those.
export const LEVELS = ['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'UNKNOWN'];

// ?level=JUNIOR&level=MID  or  ?level=JUNIOR,MID  both work. Case does not matter.
const levelList = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    const parts = Array.isArray(value) ? value : [value];
    return parts
      .flatMap((part) => String(part).split(','))
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);
  },
  z.array(z.enum(LEVELS)).max(LEVELS.length).optional(),
);

// An empty value (?source=) means "no filter".
const text = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).max(100).optional(),
);

// Query string of GET /api/jobs. Unknown parameters are ignored (later phases add more).
export const listJobsQuerySchema = z.object({
  since: z.enum(['24h', '2d', '7d', 'all']).default('all'),
  source: text,
  company: text,
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  level: levelList,
  years: z.coerce.number().min(0).max(60).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// :id in /api/jobs/:id
export const jobIdParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});
