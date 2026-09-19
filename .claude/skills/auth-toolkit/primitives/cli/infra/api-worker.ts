import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';
import {
  hostsFor,
  instanceConfigFor,
  isProdStage,
  productionHost,
} from './config.ts';

export const ApiWorker = Cloudflare.Worker(
  'ApiWorker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    const isProd = isProdStage(stage);

    if (isProd && process.env.CI !== 'true') {
      return yield* Effect.die(
        new Error('Production must be deployed through CI.'),
      );
    }

    const { authWorkerUrl } = instanceConfigFor(hostsFor(stage));

    return {
      main: './src/entry/cloudflare.ts',
      ...(isProd
        ? { domain: productionHost }
        : { dev: { port: portFromPortless() } }),
      workersDev: false,
      compatibility: { date: '2025-09-02', flags: ['nodejs_compat'] },
      env: { AUTH_URL: authWorkerUrl },
    };
  }),
);

const portFromPortless = (): number => {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'PORT must be assigned by Portless. Start the worker with `pnpm dev`.',
    );
  }
  return port;
};

export type WorkerEnv = Cloudflare.InferEnv<typeof ApiWorker>;
