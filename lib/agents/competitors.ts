/**
 * Competitor handle rules, shared by the API route and the CLI so both accept
 * the same input and enforce the same cap.
 */

import { z } from "zod";

// Keeps a weekly scrape well inside Apify's free monthly credit.
export const MAX_COMPETITORS = 10;

// Instagram usernames: letters, digits, dots and underscores, up to 30.
// Accepts a pasted profile URL or an @handle.
export const handleSchema = z
  .string()
  .transform((s) =>
    s
      .trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .replace(/\/.*$/, "")
      .toLowerCase()
  )
  .pipe(z.string().regex(/^[a-z0-9._]{1,30}$/, "Not a valid Instagram handle"));
