import { AlchemyContext, Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

const productionHost = 'tts.kishore.app';

export const Worker = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    const { dev } = yield* AlchemyContext;
    const deployed = stage === 'prod' || /^pr[0-9]+$/.test(stage);
    if (deployed && process.env.CI !== 'true') {
      throw new Error('Deploy prod and PR stages through GitHub Actions.');
    }
    const port = Number(process.env.PORT);
    if (dev && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error('Run pnpm dev so Portless can assign PORT.');
    }
    return {
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
  'VoiceAnchors',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Worker,
);
