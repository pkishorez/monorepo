// A Test User's email ends in this reserved top-level domain (RFC 2606), so
// no real mailbox, and no Google account, can ever have one.
const TEST_DOMAIN = '.test';

/** An email as Auth compares it: trimmed and lowercased. */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

/** Whether `email` is a Test User's: it ends in `.test`. The email is the
 * only mark a Test User has; nothing else about them is stored. */
export const isTestEmail = (email: string): boolean =>
  normalizeEmail(email).endsWith(TEST_DOMAIN);
