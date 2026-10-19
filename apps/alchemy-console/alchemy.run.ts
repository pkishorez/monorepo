import { AlchemyContext, localState, Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { UserSpace } from './src/server/worker.ts';

/*
 * Console's one stack: the Console Worker, a Kabuki Start site whose main
 * module also exports the User Space Durable Object class, bound as
 * `USER_SPACE`.
 *
 * Stages:
 * - `prod` → console.kishore.app, from `main`;
 * - `dev` → dev-console.kishore.app, from every push to `console-next`;
 * - `pr<N>` → pr<N>-console.kishore.app, one per pull request.
 * Those three deploy only from CI (`CI=true`), with the Auth Worker at
 * auth.kishore.app, and keep their state in Cloudflare. Any other stage is
 * personal, as `alchemy dev` makes: state on disk, and Local mode sign-in
 * unless `CONSOLE_AUTH_URL` names an Auth Worker (auth.kishore.computer
 * behind portless).
 */

const productionHost = 'console.kishore.app';
const authWorker = 'https://auth.kishore.app';

const isDeployed = (stage: string) =>
  stage === 'prod' || stage === 'dev' || /^pr[0-9]+$/.test(stage);

const domainFor = (stage: string) =>
  stage === 'prod' ? productionHost : `${stage}-${productionHost}`;

export const Worker = Cloudflare.Website.Vite(
  'Worker',
  Effect.gen(function* () {
    const stage = yield* Stage;
    const { dev } = yield* AlchemyContext;
    const deployed = isDeployed(stage);
    if (deployed && process.env.CI !== 'true') {
      throw new Error(
        `Deploy "${stage}" through GitHub Actions (deploy-alchemy-console.yml), not by hand.`,
      );
    }
    const port = Number(process.env.PORT);
    if (dev && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error('Run pnpm dev so Portless can assign PORT.');
    }
    return {
      env: {
        USER_SPACE: Cloudflare.DurableObject<UserSpace>('UserSpace'),
        // The Invite list: emails, comma-separated.
        CONSOLE_INVITES:
          process.env.CONSOLE_INVITES ?? 'kishore.iiitn@gmail.com',
        // Inlined into the Worker and the browser alike; '' is Local mode.
        VITE_CONSOLE_AUTH_URL: deployed
          ? authWorker
          : (process.env.CONSOLE_AUTH_URL ?? ''),
      },
      compatibility: { date: '2026-07-01', flags: ['nodejs_compat'] },
      dev: dev ? { port } : undefined,
      domain: deployed ? domainFor(stage) : undefined,
    };
  }),
);

export type WorkerEnv = Cloudflare.InferEnv<typeof Worker>;

/** Deployed stages share their state in Cloudflare; a personal one keeps it on disk, in `.alchemy/`. */
const State = Layer.unwrap(
  Effect.gen(function* () {
    const stage = yield* Stage;
    return isDeployed(stage) ? Cloudflare.state() : localState();
  }),
);

export default Stack(
  'AlchemyConsole',
  { providers: Cloudflare.providers(), state: State },
  Worker,
);
