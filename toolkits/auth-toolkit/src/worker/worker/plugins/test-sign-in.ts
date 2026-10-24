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

        const { internalAdapter, secret, authCookies } = ctx.context;
        const sessionCookie = authCookies.sessionToken;
        const existing = await internalAdapter.findUserByEmail(email);

        // The Accounts this browser holds, from its multi-session cookies.
        // A cookie that is unsigned, revoked or expired holds none and is
        // cleared; one for the Test User signing in again is replaced.
        const held = new Set<string>();
        const replaced: Array<string> = [];
        for (const name of parseCookies(
          ctx.headers?.get('cookie') ?? '',
        ).keys()) {
          if (!name.includes('_multi-')) continue;
          const token = await ctx.getSignedCookie(name, secret);
          const found = token ? await internalAdapter.findSession(token) : null;
          const live =
            found !== null && found.session.expiresAt.getTime() > Date.now();
          if (live && found.user.id !== existing?.user.id) {
            held.add(found.user.id);
            continue;
          }
          if (live && token) replaced.push(token);
          ctx.setCookie(name, '', { ...sessionCookie.attributes, maxAge: 0 });
        }

        // Refused before the Sign-in is made, so the browser keeps the
        // Accounts it had.
        if (held.size >= maxAccounts) {
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
        if (replaced.length > 0) await internalAdapter.deleteSessions(replaced);
        const session = await internalAdapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        // The Account's multi-session cookie, set here rather than by the
        // multiSession plugin's after hook, which counts the cookies cleared
        // above too and would leave the new Sign-in active but unlisted. With
        // this cookie set, that hook does nothing.
        await ctx.setSignedCookie(
          `${sessionCookie.name}_multi-${session.token.toLowerCase()}`,
          session.token,
          secret,
          sessionCookie.attributes,
        );
        return ctx.json({ user: parseUserOutput(ctx.context.options, user) });
      },
    ),
  },
});
