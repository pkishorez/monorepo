/** An email as Auth compares it: trimmed and lowercased. */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();
