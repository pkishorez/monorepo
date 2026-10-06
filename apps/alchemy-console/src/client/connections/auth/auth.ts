import { Effect } from 'effect';
import { Accounts, accountsLive } from '@kstackz/auth-toolkit/clients/accounts';

// Built once so every caller shares one Auth Worker client.
export const accounts = Effect.runSync(
  Accounts.useSync((accounts) => accounts).pipe(
    Effect.provide(
      accountsLive({
        authWorkerUrl: import.meta.env.DEV
          ? 'https://auth.kishore.computer'
          : 'https://auth.kishore.app',
      }),
    ),
  ),
);
