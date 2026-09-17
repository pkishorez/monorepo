import type { D1Database } from '@cloudflare/workers-types';
import { d1PrimaryDatabase } from 'auth-toolkit/database/d1';
import { createAuthWorker } from 'auth-toolkit/worker';

interface Env {
  readonly DB: D1Database;
  readonly AUTH_SECRET: string;
  readonly GOOGLE_CLIENT_ID: string;
  readonly GOOGLE_CLIENT_SECRET: string;
}

export default {
  fetch(request, env) {
    const baseURL = request.headers.get('x-durable-auth-origin');
    if (baseURL === null) return new Response(null, { status: 403 });
    const url = new URL(request.url);
    const publicOrigin = new URL(baseURL);
    url.protocol = publicOrigin.protocol;
    url.host = publicOrigin.host;
    return createAuthWorker({
      baseURL,
      secret: env.AUTH_SECRET,
      database: d1PrimaryDatabase(env.DB),
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      trustedOrigins: [baseURL],
    }).handler(new Request(url, request));
  },
} satisfies ExportedHandler<Env>;
