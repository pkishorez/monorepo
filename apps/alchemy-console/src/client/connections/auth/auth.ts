import { Effect } from 'effect';
import { Auth } from '@kstackz/auth-toolkit/clients/auth';
import { authLive } from '@kstackz/auth-toolkit/clients/auth/live';

// Built once so every caller shares one Auth Worker client.
export const accounts = Effect.runSync(
  Auth.useSync((accounts) => accounts).pipe(
    Effect.provide(
      authLive({
        authWorkerUrl: import.meta.env.DEV
          ? 'https://auth.kishore.computer'
          : 'https://auth.kishore.app',
      }),
    ),
  ),
);
