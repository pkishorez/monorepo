import { Effect } from 'effect';
import { SignIn } from '@kstackz/auth-toolkit/client';
import { cookie } from '@kstackz/auth-toolkit/client/web';

// Built once so every caller shares one Auth Worker client.
export const accounts = Effect.runSync(
  SignIn.useSync((accounts) => accounts).pipe(
    Effect.provide(
      cookie({
        authWorkerUrl: import.meta.env.DEV
          ? 'https://auth.kishore.computer'
          : 'https://auth.kishore.app',
      }),
    ),
  ),
);
