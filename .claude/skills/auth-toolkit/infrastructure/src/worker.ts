import { createAuthWorker } from 'auth-toolkit/worker';
import { d1PrimaryDatabase } from 'auth-toolkit/database/d1';
import type { WorkerEnv } from '../alchemy.run.ts';

export default {
  fetch(request: Request, env: WorkerEnv) {
    const { handler } = createAuthWorker({
      baseURL: env.AUTH_URL,
      secret: env.AUTH_SECRET,
      database: d1PrimaryDatabase(env.DB),
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      trustedOrigins: JSON.parse(env.TRUSTED_ORIGINS) as string[],
      cookieDomain: env.COOKIE_DOMAIN,
    });

    return handler(request);
  },
};
