import { Stack, Stage } from 'alchemy';
import * as Output from 'alchemy/Output';
import AppRpc from './src/infra/rpc.ts';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

const productionHost: string = '__PRODUCTION_HOST__';

export const Worker = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    const deployed = stage === 'prod' || /^pr[0-9]+$/.test(stage);
    if (deployed && process.env.CI !== 'true') {
      throw new Error('Deploy prod and PR stages through GitHub Actions.');
    }
    if (deployed && !productionHost) {
      throw new Error('Choose a production domain before deploying.');
    }
    const port = Number(process.env.PORT);
    if (!deployed && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error('Run pnpm dev so Portless can assign PORT.');
    }
    const rpc = yield* AppRpc;
    return {
      env: {
        VITE_RPC_URL: Output.map(rpc.url, (url) => {
          if (!url) throw new Error('RPC worker URL is missing');
          return url;
        }),
      },
      compatibility: { date: '2025-09-02', flags: ['nodejs_compat'] },
      dev: deployed ? undefined : { port },
      domain: deployed
        ? stage === 'prod'
          ? productionHost
          : `${stage}-${productionHost}`
        : undefined,
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Worker>;

export default Stack(
  '__STACK_NAME__',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Worker,
);
