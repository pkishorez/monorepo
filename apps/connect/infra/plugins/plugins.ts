import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { folders } from '@kestack/cli-platform/files';
import { belowMinimum } from '../../src/cloud/contract/index.ts';
import { where } from '../stage.ts';
import {
  builtHash,
  bundleFile,
  checkBuild,
  logFile,
  readLog,
} from './release-log/index.ts';
import { folderShelf, PluginFiles, r2Shelf } from './shelf/index.ts';

/*
 * What a Stage tells every Connection about its Plugins: which Release of
 * each to run, on the Shelf, and the Minimum Connect, the oldest
 * `ke-connect` let run them. There is one Plugin, `code`.
 *
 * A deployed Stage names the latest Release in the Plugin's Release Log,
 * and refuses to deploy unless the build is that Release; its file goes
 * on the R2 Shelf. Off a deployed Stage the Log is not asked: the build is
 * named as it is, and without one none is. A personal Stage puts it on the
 * R2 Shelf too; `alchemy dev` on the folder Shelf, so development reads
 * its Plugin the way a deployed Connection does. The Worker waits on the
 * Shelf, so no Connection is told of a file before it is there.
 */

export { PluginFiles };

/** The folder Shelf `alchemy dev` puts its build on: in the cache every Connection shares. */
export const DEV_SHELF = join(
  folders({ app: 'connect', name: 'dev' }).cache,
  'connect',
  'shelf',
);

/** The Release of the Plugin `name` this Stage names, once on its Shelf; null when it names none. */
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
    if (hash === null || (!at.dev && origin === undefined)) return null;
    const url = at.dev
      ? yield* folderShelf(DEV_SHELF).put({ name, hash, file })
      : yield* r2Shelf(origin!).put({ name, hash, file });
    return Output.map(url, (url) => ({ hash, url }));
  });

/** The Worker's `PLUGINS`, `{"code":{"hash","url"}}`, once its file is on the Shelf; empty when it names none. */
export const plugins = Effect.gen(function* () {
  const code = yield* releaseOf('code');
  return code === null
    ? ''
    : Output.map(code, (version) => JSON.stringify({ code: version }));
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
