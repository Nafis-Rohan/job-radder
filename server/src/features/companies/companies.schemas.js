import { z } from 'zod';
import { parsePublicHttpsUrl } from '../../shared/utils/safeUrl.js';
import { normalizeCompany } from './companyMatcher.js';

export const MAX_ALIASES = 20;

// A name with at least one real letter or digit (not only "..." or "Ltd").
const name = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => normalizeCompany(value) !== '', { message: 'Enter a real company name' });

const alias = z.string().trim().min(1).max(100);
const aliasList = z
  .array(alias)
  .max(MAX_ALIASES)
  .transform((items) => {
    // the same alias twice (any spelling) is saved once
    const seen = new Set();
    return items.filter((item) => {
      const key = normalizeCompany(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

// The career page: https, a public domain, no address tricks. Saved clean (no #fragment).
const careersUrl = z
  .string()
  .trim()
  .max(500)
  .transform((value, ctx) => {
    const url = parsePublicHttpsUrl(value);
    if (!url) {
      ctx.addIssue({ code: 'custom', message: 'Enter the career page as a public https link, like https://example.com/career/' });
      return z.NEVER;
    }
    return url.href;
  });

// strictObject: unknown fields (like userId) are rejected, never saved.
export const createCompanySchema = z.strictObject({
  name,
  aliases: aliasList.default([]),
  careersUrl, // required: without it the app has no jobs to read for this company
});

export const updateCompanySchema = z
  .strictObject({
    name: name.optional(),
    aliases: aliasList.optional(),
    careersUrl: careersUrl.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change' });

export const companyIdParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});
