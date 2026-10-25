import { normalizeEmail, type User } from '../../contract/index.js';

/** The one domain a fake User's email may be at. A `.test` domain, so no
 * real mailbox has it and every backend sees a Test User. */
export const FAKE_DOMAIN = 'kestack.test';

/** Whether `email` may be a fake User's: at `FAKE_DOMAIN`, nothing else. */
export const isFakeEmail = (email: string): boolean =>
  normalizeEmail(email).endsWith(`@${FAKE_DOMAIN}`);

// A fake token's prefix and a fake user's id prefix are kept on devices,
// and toolkits/ai-toolkit copies the token, so they never change.
const PREFIX = 'local.';

const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (encoded: string): string => {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0)),
  );
};

const isUser = (value: unknown): value is User =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as User).id === 'string' &&
  typeof (value as User).email === 'string' &&
  typeof (value as User).name === 'string';

/** The token a fake Account holds. It carries its User, so the fake guard
 * reads them without asking anyone. */
export const fakeToken = {
  make: (user: User): string =>
    `${PREFIX}${toBase64Url(
      JSON.stringify({ id: user.id, email: user.email, name: user.name }),
    )}`,
  /** The User a fake token names, or null for anything else. */
  read: (token: string): User | null => {
    if (!token.startsWith(PREFIX)) return null;
    try {
      const value: unknown = JSON.parse(
        fromBase64Url(token.slice(PREFIX.length)),
      );
      return isUser(value)
        ? { id: value.id, email: value.email, name: value.name }
        : null;
    } catch {
      return null;
    }
  },
};

/** The fake User an email names: the same email is always the same User,
 * and its id comes from the email alone. Only an email at `FAKE_DOMAIN`
 * names one; any other is null. The name defaults to the part before the
 * `@`. */
export const fakeUser = (input: {
  readonly email: string;
  readonly name?: string | undefined;
}): User | null => {
  if (!isFakeEmail(input.email)) return null;
  const email = normalizeEmail(input.email);
  return {
    id: `local_${toBase64Url(email)}`,
    email,
    name: input.name?.trim() || email.split('@')[0] || email,
  };
};
