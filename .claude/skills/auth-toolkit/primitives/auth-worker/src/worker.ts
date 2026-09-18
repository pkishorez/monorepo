import { d1PrimaryDatabase } from 'auth-toolkit/database/d1';
import { createAuthWorker } from 'auth-toolkit/worker';
import type { WorkerEnv } from '../infra/auth-worker.ts';
import {
  authConfigFor,
  authorizationServer,
  branding,
  cookieCacheMaxAge,
} from '../infra/config.ts';

// The handler owns every path: Better Auth under /api/auth, and, with the
// Authorization Server Role on, the login, consent, and device pages.
export default {
  fetch(request, env) {
    const { handler } = createAuthWorker({
      ...authConfigFor(env.AUTH_HOST),
      secret: env.AUTH_SECRET,
      database: d1PrimaryDatabase(env.DB),
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      cookieCacheMaxAge,
      branding,
      authorizationServer,
    });
    return handler(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
