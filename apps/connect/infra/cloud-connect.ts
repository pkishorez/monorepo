import { readFileSync } from 'node:fs';
import { Action, Stage } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { backend, portlessPort } from '@kestack/web-platform/app/alchemy';
import { D1 } from '@kestack/std-toolkit/alchemy';
import { connectionsTable } from '../src/cloud/worker/index.ts';
import {
  builtCode,
  CODE_BUNDLE,
  connectVersion,
  pluginsEnv,
} from './plugins.ts';
import { where } from './stage.ts';

/*
 * Cloud Connect's Worker, served at `connect.kishore.app` (Portless's
 * `connect.kishore.computer` under `alchemy dev`, with the branch in front
 * in a linked worktree), with a D1 database of its own holding the
 * `connections` std Table. The table goes through std-toolkit's deploy guard,
 * which refuses a deploy whose table would no longer read the rows
 * already stored, and the Worker is deployed only behind it. Under `pnpm
 * dev` it signs in with auth-toolkit's Fake, as the Web Platform's
 * `backend` bundles it.
 *
 * The Plugins ship with it. The code Plugin `pnpm build:plugin` built is
 * uploaded to an R2 bucket of the Stage's own, named by its sha256, unless
 * it is there; the Worker serves it from there and names it in `PLUGINS`,
 * so every Connection runs it. The Worker waits on the upload, so no
 * Connection is told of a file before it is there. A deployed Stage
 * refuses to deploy without the file; elsewhere, without it, `PLUGINS` is
 * empty, and development runs the Plugin from a file. `CONNECT_VERSION`
 * is this package's version.
 */

/** A Plugin's file never changes: its name is its hash. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

export const PluginFiles = Cloudflare.R2.Bucket(
  'PluginFiles',
  Effect.gen(function* () {
    const stage = yield* Stage;
    // Only prod's files outlive their Stage; a preview's go with it.
    return { name: `connect-plugins-${stage}`, forceDestroy: stage !== 'prod' };
  }),
);

/** Uploads the file at `file` to the bucket at `key`, unless it is there: its key. */
const PublishPlugin = Action(
  'PublishPlugin',
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(yield* PluginFiles);
    return Effect.fn(function* ({
      key,
      file,
    }: {
      readonly key: string;
      readonly file: string;
    }) {
      if ((yield* bucket.head(key)) === null)
        yield* bucket.put(key, readFileSync(file), {
          httpMetadata: {
            contentType: 'text/javascript; charset=utf-8',
            cacheControl: IMMUTABLE,
          },
        });
      return key;
    });
  }).pipe(Effect.provide(Cloudflare.R2.ReadWriteBucketLocal)),
);

/** The Worker's `PLUGINS`, once the code Plugin it names is uploaded; empty when none is built off a deployed Stage. */
const plugins = Effect.gen(function* () {
  const at = yield* where;
  const origin = at.url();
  const code = origin === undefined ? null : builtCode(origin);
  if (code === null) {
    if (at.domain() !== undefined)
      return yield* Effect.die(
        new Error(
          `${CODE_BUNDLE} is missing: run \`pnpm --filter @kestack/connect build:plugin\` before deploying`,
        ),
      );
    return '';
  }
  const published = yield* PublishPlugin({ key: code.key, file: CODE_BUNDLE });
  return Output.map(published, () => pluginsEnv([code]));
});

export const CloudConnectDatabase = Cloudflare.D1.Database(
  'CloudConnectDatabase',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return { name: `connect-${stage}` };
  }),
);

export const CloudConnect = Cloudflare.Worker(
  'CloudConnect',
  Effect.gen(function* () {
    const at = yield* where;
    const database = yield* CloudConnectDatabase;
    const table = yield* D1.table('ConnectionsTable', {
      table: connectionsTable,
      database,
      mode: 'persistent',
    });
    const domain = at.domain();
    return {
      main: './src/cloud/worker/worker.server.ts',
      ...backend(at),
      compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
      ...(domain === undefined ? {} : { domain }),
      ...(at.dev ? { dev: { port: portlessPort(), strictPort: true } } : {}),
      env: {
        AUTH_URL: at.authUrl,
        ALLOWED_ORIGINS: at.origins,
        // The Plugins every Connection runs, `{"code":{"hash","url"}}`.
        PLUGINS: yield* plugins,
        CONNECT_VERSION: connectVersion(),
        DB: CloudConnectDatabase,
        PLUGIN_FILES: PluginFiles,
      },
      // Keep the Worker's deployment behind the table and its guard.
      tag: Output.map(table.snapshot, () => 'connections'),
    };
  }),
);
