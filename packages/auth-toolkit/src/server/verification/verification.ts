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
  /** The incoming request being authenticated — only its `cookie` and
   * `x-forwarded-*` headers are forwarded, server-to-server. */
  request: Request;
}

export const verifyRequest = async ({
  authWorkerUrl,
  request,
}: VerifyRequestOptions): Promise<VerifyPayload | null> => {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;

  const headers: Record<string, string> = { cookie };
  for (const [name, value] of request.headers) {
    if (name.toLowerCase().startsWith('x-forwarded-')) {
      headers[name] = value;
    }
  }

  let refreshedCookies: string[] = [];
  const client = createAuthClient({ baseURL: authWorkerUrl });
  const { data } = await client.getSession({
    fetchOptions: {
      headers,
      onSuccess: ({ response }) => {
        refreshedCookies = response.headers.getSetCookie();
      },
    },
  });
  if (!data) return null;

  return { session: data.session, user: data.user, refreshedCookies };
};
