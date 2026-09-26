import { createFileRoute } from '@tanstack/react-router';
import { servedHeaders } from '../../../lib/served.ts';

const COOKIE = 'pwa-playground-session';

const signedInUser = (request: Request): string | null => {
  const match = (request.headers.get('cookie') ?? '').match(
    new RegExp(`(?:^|; )${COOKIE}=([^;]+)`),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

// A fake session. Under /api/auth/, so the worker never caches it
// (neverCache), even though the catch-all /api/ rule would match.
export const Route = createFileRoute('/api/auth/session')({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.json(
          { user: signedInUser(request) },
          { headers: servedHeaders() },
        ),
      POST: async ({ request }) => {
        const { action } = (await request.json()) as { action?: string };
        const headers = new Headers(servedHeaders());
        const user = action === 'sign-in' ? 'demo-user' : null;
        headers.append(
          'set-cookie',
          user === null
            ? `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`
            : `${COOKIE}=${user}; Path=/; SameSite=Lax; Secure; HttpOnly`,
        );
        return Response.json({ user }, { headers });
      },
    },
  },
});
