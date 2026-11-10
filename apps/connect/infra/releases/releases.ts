import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { folders } from '@kestack/cli-platform/files';
import { belowMinimum } from '../../src/heartbeat/index.ts';
import { where } from '../stage.ts';
import {
  builtHash,
  bundleFile,
  checkBuild,
  logFile,
  readLog,
} from './release-log/index.ts';
import { folderFiles, r2Files, ReleaseFiles } from './files/index.ts';

/*
 * What a Stage tells every Connection about its Plugins: which Release of
 * each to run, with its Release File kept; and the Minimum Connect, the oldest
 * `ke-connect` Connect Cloud answers at all. There is one Plugin, `code`.
 *
 * A deployed Stage names the latest Release in the Plugin's Release Log,
 * and refuses to deploy unless the build is that Release; its file goes
 * in R2. Under `alchemy dev` the Log is not asked: the build is named as it
 * is, and without one none is, with its file in a folder, so development reads
 * its Plugin the way a deployed Connection does. A personal Stage, `alchemy
 * deploy --stage alice`, has no domain, so no URL a Connection could read its
 * Release Files at before its Worker is made: it refuses to deploy. The Worker
 * waits on the file, so no Connection is told of one before it is there.
 */

export { ReleaseFiles };

/** The folder `alchemy dev` puts its Release Files in: in the cache every Connection shares. */
export const DEV_RELEASE_FILES = join(
  folders({ app: 'connect', name: 'dev' }).cache,
  'connect',
  'releases',
);

/** The Release of the Plugin `name` this Stage names, once its file is kept; null when it names none. */
const releaseOf = (name: string) =>
  Effect.gen(function* () {
    const at = yield* where;
    const file = bundleFile(name);
    const hash = builtHash(file);
    if (at.domain() !== undefined) {
      if (hash === null)
        return yield* Effect.die(
          new Error(
            `${file} is missing: run \`pnpm --filter @kestack/connect build:plugin\` before deploying`,
          ),
        );
      yield* readLog(logFile(name)).pipe(
        Effect.flatMap((log) => checkBuild(log, hash)),
        Effect.orDie,
      );
    }
    const origin = at.url();
    if (!at.dev && origin === undefined)
      return yield* Effect.die(
        new Error(
          `Stage ${at.stage} has no URL, so no Connection could download ${name}: deploy prod, demo or a pull request's prN, or run \`alchemy dev\``,
        ),
      );
    if (hash === null) return null;
    const url = at.dev
      ? yield* folderFiles(DEV_RELEASE_FILES).put({ name, hash, file })
      : yield* r2Files(origin!).put({ name, hash, file });
    return Output.map(url, (url) => ({ hash, url }));
  });

/** The Worker's `RELEASES`, `{"code":{"hash","url"}}`, once its file is kept; empty when it names none. */
export const releases = Effect.gen(function* () {
  const code = yield* releaseOf('code');
  return code === null
    ? ''
    : Output.map(code, (release) => JSON.stringify({ code: release }));
});

/** What `package.json` says of this Connect. */
interface Package {
  readonly version: string;
  readonly minConnect?: unknown;
}

/** The Minimum Connect `pkg` names; dies when it names none, or one newer than the Connect it is, which would be Outdated itself. */
export const minConnectOf = (pkg: Package) =>
  typeof pkg.minConnect !== 'string'
    ? Effect.die(new Error('package.json names no `minConnect`'))
    : belowMinimum(pkg.version, pkg.minConnect)
      ? Effect.die(
          new Error(
            `package.json's \`minConnect\`, ${pkg.minConnect}, is newer than this Connect, ${pkg.version}`,
          ),
        )
      : Effect.succeed(pkg.minConnect);

/** The Worker's `MIN_CONNECT`: the Minimum Connect, as `minConnect` in `package.json` names it. A person bumps it on purpose. */
export const minConnect = Effect.suspend(() =>
  minConnectOf(
    JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as Package,
  ),
);
