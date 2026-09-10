import { d1PrimaryDatabase } from 'auth-toolkit/database/d1';
import { createAuthWorker } from 'auth-toolkit/worker';
import type { WorkerEnv } from '../infra/auth-worker.ts';
import { authConfigFor, cookieCacheMaxAge } from '../infra/config.ts';

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
    });
    return handler(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
