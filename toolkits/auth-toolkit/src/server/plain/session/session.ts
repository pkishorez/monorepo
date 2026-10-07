import { createAuthClient } from 'better-auth/client';
import type { Session, User } from 'better-auth';

export interface VerifyPayload {
  session: Session;
  user: User;
  /** Cookies set when the Auth Worker refreshed the session during this check.
   * Relaying them back onto the Consumer Backend's own response is optional —
   * append each value as a separate `Set-Cookie` header. */
  refreshedCookies: string[];
}

interface VerifyRequestOptions {
  /** The Auth Worker's own deployed URL. */
  authWorkerUrl: string;
  /** The incoming request being authenticated — only its `authorization` or
   * `cookie` and `x-forwarded-*` headers are forwarded, server-to-server. */
  request: Request;
}

export const verifyRequest = async ({
  authWorkerUrl,
  request,
}: VerifyRequestOptions): Promise<VerifyPayload | null> => {
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
  const client = createAuthClient({ baseURL: authWorkerUrl });
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
  // here is the Auth Worker being unavailable, not an absent session.
  if (error) {
    throw new Error(
      `Auth Worker session check failed with status ${error.status ?? 'unknown'}`,
    );
  }
  if (!data) return null;

  return { session: data.session, user: data.user, refreshedCookies };
};
