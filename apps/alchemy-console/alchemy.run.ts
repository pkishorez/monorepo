import { AlchemyContext, Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

const productionHost: string = 'alchemy.kishore.app';

export const Worker = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    const { dev } = yield* AlchemyContext;
    const deployed = stage === 'prod' || /^pr[0-9]+$/.test(stage);
    if (deployed && process.env.CI !== 'true') {
      throw new Error('Deploy prod and PR stages through GitHub Actions.');
    }
    if (deployed && !productionHost) {
      throw new Error('Choose a production domain before deploying.');
    }
    const port = Number(process.env.PORT);
    if (dev && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error('Run pnpm dev so Portless can assign PORT.');
    }
    const database = yield* Cloudflare.D1.Database('Database', {
      name: `alchemy-console-${stage}`,
    });

    return {
      env: { DB: database },
      compatibility: { date: '2026-07-01', flags: ['nodejs_compat'] },
      dev: dev ? { port } : undefined,
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
  'AlchemyConsole',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Worker,
);
