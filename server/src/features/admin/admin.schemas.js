import { z } from 'zod';

// ?limit=50  (default 20, at most 100)
export const scanRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
