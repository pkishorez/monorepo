import { existsSync } from 'node:fs';
import { AlchemyContext, localState, Stack, Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Secrets from 'alchemy/Secrets';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as StdToolkit from '@kestack/std-toolkit/alchemy';
import { connectionIndexTable } from './src/server/connection-index/index.ts';
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
 *
 * The Vault key, `CONSOLE_VAULT_KEY`, seals every secret a user hands
 * Console, and is bound as a Worker secret. CI passes each deployed stage's
 * own; a personal stage reads it from `.env.vault-local`.
 *
 * The GitHub App's keys, `GH_APP_*`, are Worker secrets too: `dev` is the
 * `alchemy-console-dev` App's, `prod` and the previews the `alchemy-console`
 * App's, passed by CI by the stage deployed; a personal stage reads the dev
 * App's from `.env.github-dev`. The connection index, which user owns each
 * installation, is a D1 database of the stage's own.
 */

const productionHost = 'console.kishore.app';
const authWorker = 'https://auth.kishore.app';

const isDeployed = (stage: string) =>
  stage === 'prod' || stage === 'dev' || /^pr[0-9]+$/.test(stage);

/** A personal stage's Vault key, kept out of `.env` so it is never shared by accident. */
const VAULT_LOCAL = '.env.vault-local';
/** A personal stage's GitHub App: the dev App's keys. */
const GITHUB_LOCAL = '.env.github-dev';

/** A secret the stage cannot run without, read as Alchemy reads its settings. */
const required = (name: string, deployed: boolean, local: string) =>
  Config.Redacted(name).pipe(
    Effect.catch(() =>
      Effect.die(
        new Error(
          deployed
            ? `${name} is not set: CI passes it from the repository secrets.`
            : `Put ${name} in ${local}.`,
        ),
      ),
    ),
  );

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
    // Read as Alchemy reads its settings, so `.env` and `--env-file` count.
    const invites = yield* Config.String('CONSOLE_INVITES').pipe(
      Config.withDefault('kishore.iiitn@gmail.com'),
      Effect.orDie,
    );
    const localAuthUrl = yield* Config.String('CONSOLE_AUTH_URL').pipe(
      Config.withDefault(''),
      Effect.orDie,
    );
    const vaultKey = yield* required(
      'CONSOLE_VAULT_KEY',
      deployed,
      `${VAULT_LOCAL} (32 random bytes, base64)`,
    );
    const app = {
      GH_APP_ID: yield* required('GH_APP_ID', deployed, GITHUB_LOCAL),
      GH_APP_SLUG: yield* required('GH_APP_SLUG', deployed, GITHUB_LOCAL),
      GH_APP_PRIVATE_KEY: yield* required(
        'GH_APP_PRIVATE_KEY',
        deployed,
        GITHUB_LOCAL,
      ),
      GH_APP_WEBHOOK_SECRET: yield* required(
        'GH_APP_WEBHOOK_SECRET',
        deployed,
        GITHUB_LOCAL,
      ),
    };
    const index = yield* Cloudflare.D1.Database('ConnectionIndex');
    yield* StdToolkit.D1.table('ConnectionIndexTable', {
      table: connectionIndexTable,
      database: index,
    });
    const port = Number(process.env.PORT);
    if (dev && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error('Run pnpm dev so Portless can assign PORT.');
    }
    return {
      env: {
        USER_SPACE: Cloudflare.DurableObject<UserSpace>('UserSpace'),
        // The Invite list: emails, comma-separated.
        CONSOLE_INVITES: invites,
        // The Vault's key, a Worker secret.
        CONSOLE_VAULT_KEY: vaultKey,
        // The GitHub App's ID, slug, private key and webhook secret.
        ...app,
        // The connection index: installation → user.
        CONSOLE_INDEX: index,
        // Inlined into the Worker and the browser alike; '' is Local mode.
        VITE_CONSOLE_AUTH_URL: deployed ? authWorker : localAuthUrl,
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
  {
    providers: Layer.merge(Cloudflare.providers(), StdToolkit.providers()),
    state: State,
    // Deployed stages read the CI environment only; a personal one also
    // reads `.env`, the Vault key's file and the dev App's.
    secrets: ({ stage }) =>
      isDeployed(stage)
        ? Secrets.ProcessEnv()
        : [
            Secrets.DotEnv(),
            ...[VAULT_LOCAL, GITHUB_LOCAL]
              .filter((path) => existsSync(path))
              .map((path) => Secrets.DotEnv({ path })),
          ],
  },
  Worker,
);
