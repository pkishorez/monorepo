import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { d1PrimaryDatabaseResource } from 'auth-toolkit/alchemy/d1';
import { Config, Effect } from 'effect';
import { hostFor, isProdStage, productionHost } from './config.ts';

export const AuthWorker = Cloudflare.Worker(
  'AuthWorker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    const isProd = isProdStage(stage);

    // Only two instances exist: prod, deployed by GitHub Actions, and the
    // local one started by `pnpm dev`.
    if (isProd && process.env.ALLOW_DEPLOY !== 'true') {
      return yield* Effect.die(
        new Error('Refusing to deploy prod without ALLOW_DEPLOY=true.'),
      );
    }
    if (!isProd && stage !== 'dev') {
      return yield* Effect.die(
        new Error(`Unknown stage "${stage}". Use prod or dev.`),
      );
    }

    // Ships auth-toolkit's migrations; Alchemy applies them on every deploy.
    const db = yield* d1PrimaryDatabaseResource('AuthDatabase');

    return {
      main: './src/worker.ts',
      domain: isProd ? productionHost : undefined,
      workersDev: false,
      dev: isProd ? undefined : { port: portFromPortless() },
      compatibility: { date: '2025-09-02', flags: ['nodejs_compat'] },
      env: {
        DB: db,
        AUTH_HOST: hostFor(stage),
        AUTH_SECRET: yield* Config.redacted('AUTH_SECRET'),
        GOOGLE_CLIENT_ID: yield* Config.string('GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: yield* Config.redacted('GOOGLE_CLIENT_SECRET'),
      },
    };
  }),
);

// Honor the PORT injected by `portless run` (see the "dev" script).
const portFromPortless = (): number => {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'PORT must be assigned by Portless. Start the worker with `pnpm dev`.',
    );
  }
  return port;
};

export type WorkerEnv = Cloudflare.InferEnv<typeof AuthWorker>;
