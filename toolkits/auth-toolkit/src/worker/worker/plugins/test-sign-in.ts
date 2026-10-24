import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
} from 'better-auth/api';
import { parseCookies, setSessionCookie } from 'better-auth/cookies';
import { parseUserOutput } from 'better-auth/db';
import {
  TEST_SIGN_IN_PATH,
  isTestEmail,
  normalizeEmail,
} from '../../../contract/index.js';

/** The `method` a Test User is created with, so the User Admission
 * Policy can tell them from a real one. */
export const TEST_SIGN_IN_METHOD = 'test-sign-in';

/** Test Sign-In: who may sign in as a Test User, an email ending in
 * `.test`, without Google. */
export interface TestUsers {
  /** The key every Test Sign-In must carry; none is needed without one. */
  key?: string | undefined;
  /** `false` refuses the Test User's email, given lowercased. */
  allow?: ((email: string) => boolean) | undefined;
}

const field = (body: unknown, name: string) => {
  const value = (body as Record<string, unknown> | null | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
};

/** Test Sign-In: a POST of `{ email, key? }` signs the browser in as that
 * Test User, created on first use, with a normal Sign-in. `admit` is not
 * asked: it is for real users. */
export const testSignIn = ({
  key,
  allow,
  maxAccounts,
}: TestUsers & { maxAccounts: number }): BetterAuthPlugin => ({
  id: 'test-sign-in',
  endpoints: {
    testSignIn: createAuthEndpoint(
      TEST_SIGN_IN_PATH,
      { method: 'POST', use: [formCsrfMiddleware] },
      async (ctx) => {
        const email = normalizeEmail(field(ctx.body, 'email') ?? '');
        if (!/^[^\s@]+@[^\s@]+$/.test(email) || !isTestEmail(email)) {
          throw APIError.from('BAD_REQUEST', {
            code: 'NOT_A_TEST_EMAIL',
            message:
              'A test user’s email ends in .test, like ada@example.test.',
          });
        }
        if (key !== undefined && field(ctx.body, 'key') !== key) {
          throw APIError.from('UNAUTHORIZED', {
            code: 'WRONG_KEY',
            message: 'That test key is not right.',
          });
        }
        if (allow && !allow(email)) {
          throw APIError.from('FORBIDDEN', {
            code: 'NOT_ALLOWED',
            message: 'That test user can’t sign in here.',
          });
        }

        const { internalAdapter, secret } = ctx.context;

        // The Users this browser is signed in as, from its signed
        // multi-session cookies, as the multiSession plugin keeps them.
        const held = new Set<string>();
        for (const name of parseCookies(
          ctx.headers?.get('cookie') ?? '',
        ).keys()) {
          if (!name.includes('_multi-')) continue;
          const token = await ctx.getSignedCookie(name, secret);
          const found = token ? await internalAdapter.findSession(token) : null;
          if (found) held.add(found.user.id);
        }

        // Refused before any cookie is set: past the limit the multiSession
        // plugin would make the new Sign-in active without listing it.
        const existing = await internalAdapter.findUserByEmail(email);
        if (
          !(existing && held.has(existing.user.id)) &&
          held.size >= maxAccounts
        ) {
          throw APIError.from('FORBIDDEN', {
            code: 'TOO_MANY_ACCOUNTS',
            message: 'This browser holds as many accounts as it may.',
          });
        }

        // Two first sign-ins at once both try to create the Test User; the
        // one that loses reads the winner's.
        const create = () =>
          internalAdapter.createUser(
            { email, name: email.split('@')[0]!, emailVerified: true },
            { method: TEST_SIGN_IN_METHOD },
          );
        const user =
          existing?.user ??
          (await create().catch(async (error: unknown) => {
            const raced = await internalAdapter.findUserByEmail(email);
            if (raced) return raced.user;
            throw error;
          }));
        const session = await internalAdapter.createSession(user.id);
        // Also adds the Account's multi-session cookie, through that
        // plugin's after hook.
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ user: parseUserOutput(ctx.context.options, user) });
      },
    ),
  },
});
