import { Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Config, Effect } from 'effect';
import { d1PrimaryDatabaseResource } from 'auth-toolkit/alchemy/d1';
import { kvSessionStoreResource } from 'auth-toolkit/alchemy/cf-kv';

export const AuthWorker = Cloudflare.Worker(
  'AuthWorker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    if (stage !== 'prod') {
      return yield* Effect.die(new Error('Auth requires the prod stage'));
    }

    const db = yield* d1PrimaryDatabaseResource('auth-db');
    const kv = yield* kvSessionStoreResource('auth-sessions');

    const domain = yield* Config.string('AUTH_DOMAIN');

    return {
      main: './src/worker.ts',
      domain,
      workersDev: false,
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      env: {
        DB: db,
        KV: kv,
        AUTH_URL: `https://${domain}`,
        COOKIE_DOMAIN: yield* Config.string('COOKIE_DOMAIN'),
        TRUSTED_ORIGINS: yield* Config.string('TRUSTED_ORIGINS'),
        AUTH_SECRET: yield* Config.redacted('AUTH_SECRET'),
        GOOGLE_CLIENT_ID: yield* Config.string('GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: yield* Config.redacted('GOOGLE_CLIENT_SECRET'),
      },
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof AuthWorker>;

export default Stack(
  'Auth',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  AuthWorker,
);
