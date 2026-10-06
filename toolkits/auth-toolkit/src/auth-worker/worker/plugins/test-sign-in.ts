import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';

/** The only stage the Test Sign-In may run on. */
export const TEST_SIGN_IN_STAGE = 'local';

/** Test Users live under the reserved `.test` top-level domain, so one can
 * never be a real Google account. */
const TEST_EMAIL = /^[^\s@]+@[^\s@]+\.test$/i;

export const TEST_SIGN_IN_PATH = '/sign-in/test';

interface TestSignInBody {
  email?: unknown;
  name?: unknown;
}

/** Signs anyone with a `.test` email in, with no Google: for agents and
 * tests on a developer's machine. It ends like any sign-in, with a Session
 * cookie, so a sign-in that came from an authorization continues to it. */
export const testSignIn = (): BetterAuthPlugin => ({
  id: 'test-sign-in',
  endpoints: {
    signInTest: createAuthEndpoint(
      TEST_SIGN_IN_PATH,
      { method: 'POST' },
      async (ctx) => {
        const body = (ctx.body ?? {}) as TestSignInBody;
        const email =
          typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!TEST_EMAIL.test(email)) {
          throw new APIError('BAD_REQUEST', {
            message: 'Test sign-in takes only an email ending in .test',
          });
        }
        const name =
          (typeof body.name === 'string' && body.name.trim()) ||
          email.split('@')[0]!;
        const { internalAdapter } = ctx.context;
        const user =
          (await internalAdapter.findUserByEmail(email))?.user ??
          (await internalAdapter.createUser(
            { email, name, emailVerified: true },
            { method: 'test-sign-in' },
          ));
        const session = await internalAdapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ token: session.token, user });
      },
    ),
  },
});
