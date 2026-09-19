import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';
import {
  hostsFor,
  isProdStage,
  productionHost,
  resourceServerConfigFor,
} from './config.ts';

export const McpWorker = Cloudflare.Worker(
  'McpWorker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    const isProd = isProdStage(stage);

    // Two instances: prod, deployed by GitHub Actions, and the local one
    // started by `pnpm dev`. Any other stage is local too.
    if (isProd && process.env.CI !== 'true') {
      return yield* Effect.die(
        new Error('Production must be deployed through CI.'),
      );
    }

    const { authWorkerUrl, resource } = resourceServerConfigFor(
      hostsFor(stage),
    );

    return {
      main: './src/entry/cloudflare.ts',
      ...(isProd
        ? { domain: productionHost }
        : { dev: { port: portFromPortless() } }),
      workersDev: false,
      // No database, no storage: the MCP Server keeps nothing between
      // requests. nodejs_compat is for better-auth's token verification.
      compatibility: { date: '2025-09-02', flags: ['nodejs_compat'] },
      env: {
        AUTH_URL: authWorkerUrl,
        MCP_RESOURCE: resource,
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

export type WorkerEnv = Cloudflare.InferEnv<typeof McpWorker>;
