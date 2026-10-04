import { z } from "zod";

export const usernameError =
  "Use 1–80 characters: start with a lowercase letter or number, then use lowercase letters, numbers, underscores, or hyphens. Or use a valid email address.";

// Account names also form storage-key segments, so email local parts cannot
// contain path separators. Keep project IDs and article slugs separate.
export const usernameSchema = z
  .string()
  .trim()
  .max(254)
  .refine(
    (value) =>
      /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value) ||
      (!/[\/\\]/.test(value) && z.email().safeParse(value).success),
    usernameError,
  )
  .transform((value) => (value.includes("@") ? value.toLowerCase() : value));
