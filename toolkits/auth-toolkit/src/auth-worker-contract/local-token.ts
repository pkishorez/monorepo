import type { User } from './auth-worker-contract.js';

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

/** The Session token local auth hands a Local Account. It carries its User,
 * so a local Current Auth Resolver reads them without asking anyone. */
export const localToken = {
  make: (user: User): string =>
    `${PREFIX}${toBase64Url(
      JSON.stringify({ id: user.id, email: user.email, name: user.name }),
    )}`,
  /** The User a Local Token names, or null for anything else. */
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

/** The Local Account an email names: the same email is always the same
 * User. The name defaults to the part before the `@`. */
export const localUser = (input: { email: string; name?: string }): User => {
  const email = input.email.trim().toLowerCase();
  return {
    id: `local_${toBase64Url(email)}`,
    email,
    name: input.name?.trim() || email.split('@')[0] || email,
  };
};
