import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Action, Stage } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Output from 'alchemy/Output';
import { Effect, Schema } from 'effect';
import {
  belowMinimum,
  PluginHash,
  RELEASE_PATH,
  releaseKey,
} from '../src/server/rpc/heartbeat/contract/index.ts';
import { where } from './stage.ts';

const PLUGINS = fileURLToPath(new URL('../../plugins/', import.meta.url));

const CONNECT_PACKAGE = new URL('../../connect/package.json', import.meta.url);

const IMMUTABLE = 'public, max-age=31536000, immutable';

const ReleaseLog = Schema.Array(
  Schema.Struct({ hash: PluginHash, line: Schema.NonEmptyString }),
);

const PluginPackage = Schema.Struct({
  connect: Schema.Struct({ enabledByDefault: Schema.Boolean }),
});

const ConnectPackage = Schema.Struct({
  version: Schema.String,
  minConnect: Schema.optional(Schema.String),
});

interface Offered {
  readonly name: string;
  readonly hash: string;
  readonly enabledByDefault: boolean;
  readonly file: string;
}

const readJson = <T, E>(schema: Schema.Codec<T, E>, file: string): T =>
  Schema.decodeUnknownSync(Schema.fromJsonString(schema))(
    readFileSync(file, 'utf8'),
  );

const bundleFile = (name: string) => join(PLUGINS, name, 'dist', `${name}.mjs`);

const offered = (): ReadonlyArray<Offered> =>
  existsSync(PLUGINS)
    ? readdirSync(PLUGINS)
        .filter((name) => existsSync(join(PLUGINS, name, 'releases.json')))
        .flatMap((name) => {
          const latest = readJson(
            ReleaseLog,
            join(PLUGINS, name, 'releases.json'),
          ).at(-1);
          if (latest === undefined) return [];
          const { connect } = readJson(
            PluginPackage,
            join(PLUGINS, name, 'package.json'),
          );
          return [
            {
              name,
              hash: latest.hash,
              enabledByDefault: connect.enabledByDefault,
              file: bundleFile(name),
            },
          ];
        })
    : [];

const sha256 = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

export const ReleaseFiles = Cloudflare.R2.Bucket(
  'ReleaseFiles',
  Effect.gen(function* () {
    const stage = yield* Stage;
    return {
      name: `connect-v2-releases-${stage}`,
      forceDestroy: stage !== 'prod',
    };
  }),
);

const PublishRelease = Action(
  'PublishRelease',
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(yield* ReleaseFiles);
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

const published = (origin: string, plugin: Offered) =>
  Effect.gen(function* () {
    if (!existsSync(plugin.file))
      return yield* Effect.die(
        new Error(
          `${plugin.file} is missing: build the ${plugin.name} Plugin before deploying`,
        ),
      );
    if (sha256(plugin.file) !== plugin.hash)
      return yield* Effect.die(
        new Error(
          `${plugin.file} is not the latest Release in its releases.json, ${plugin.hash}`,
        ),
      );
    const path = `${RELEASE_PATH}/${releaseKey(plugin.name, plugin.hash)}`;
    const key = yield* PublishRelease(`PublishRelease-${plugin.name}`, {
      key: path.slice(1),
      file: plugin.file,
    });
    return Output.map(key, () => [
      plugin.name,
      {
        hash: plugin.hash,
        url: `${origin.replace(/\/+$/, '')}${path}`,
        enabledByDefault: plugin.enabledByDefault,
      },
    ]);
  });

export const catalog = Effect.gen(function* () {
  const plugins = offered();
  if (plugins.length === 0) return '{}';
  const at = yield* where;
  const origin = at.url();
  if (origin === undefined)
    return yield* Effect.die(
      new Error(
        `Stage ${at.stage} has no URL, so no Connection could download its Plugins: deploy prod, demo or a pull request's prN, or run \`alchemy dev\``,
      ),
    );
  const entries = yield* Effect.forEach(plugins, (plugin) =>
    published(origin, plugin),
  );
  return Output.map(Output.all(...entries), (all) =>
    JSON.stringify(Object.fromEntries(all)),
  );
});

export const minConnect = Effect.suspend(() => {
  const pkg = readJson(ConnectPackage, fileURLToPath(CONNECT_PACKAGE));
  if (pkg.minConnect === undefined) return Effect.succeed('');
  return belowMinimum(pkg.version, pkg.minConnect)
    ? Effect.die(
        new Error(
          `The connect package's \`minConnect\`, ${pkg.minConnect}, is newer than its version, ${pkg.version}`,
        ),
      )
    : Effect.succeed(pkg.minConnect);
});
