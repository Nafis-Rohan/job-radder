import { z } from 'zod';

const code = z.string().trim().regex(/^\d{6}$/, 'must be 6 digits');

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const twoFactorCodeSchema = z.object({ code });

export const loginTwoFactorSchema = z.object({
  tempToken: z.string().min(1).max(2000),
  code,
});
