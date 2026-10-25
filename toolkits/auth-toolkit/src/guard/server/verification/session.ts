import type { Session, User } from 'better-auth';
import { createAuthClient } from 'better-auth/client';

/** What Server-Side Verification returns for a Sign-in. */
export interface VerifyPayload {
  session: Session;
  user: User;
  /** Cookies set when the Auth Worker refreshed the Sign-in during this
   * check; each is one `Set-Cookie` value. */
  refreshedCookies: string[];
}

/** Asks the Auth Worker who `request`'s cookie or Device token names,
 * forwarding only that credential and the `x-forwarded-*` headers.
 * Resolves null for nobody; rejects when the Auth Worker can't answer. */
export const verifySignIn = async (
  url: string,
  request: Request,
): Promise<VerifyPayload | null> => {
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');
  if (!authorization && !cookie) return null;

  const headers: Record<string, string> = authorization
    ? { authorization }
    : { cookie: cookie! };
  for (const [name, value] of request.headers) {
    if (name.toLowerCase().startsWith('x-forwarded-')) {
      headers[name] = value;
    }
  }

  let refreshedCookies: string[] = [];
  const client = createAuthClient({ baseURL: url });
  const { data, error } = await client.getSession({
    fetchOptions: {
      headers,
      onSuccess: ({ response }) => {
        if (!authorization) {
          refreshedCookies = response.headers.getSetCookie();
        }
      },
    },
  });
  // better-fetch resolves non-2xx instead of rejecting, so an unhandled `error`
  // here is the Auth Worker being unavailable, not an absent Sign-in.
  if (error) {
    throw new Error(
      `Auth Worker session check failed with status ${error.status ?? 'unknown'}`,
    );
  }
  if (!data) return null;

  return { session: data.session, user: data.user, refreshedCookies };
};
