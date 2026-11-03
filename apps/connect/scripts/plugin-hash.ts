import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import {
  builtHash,
  bundleFile,
  checkBuild,
  logFile,
  readLog,
} from '../infra/plugins/release-log/index.ts';

/*
 * Prints, for every Plugin in `src/plugins/`, the sha256 of its build, the
 * hash a deploy names, and whether it is the latest Release in its Release
 * Log, as a deployed Stage requires. A Plugin not built fails. With
 * `--check`, so does one that is not its latest Release: the deploy chain
 * runs it before it deploys.
 */

const check = process.argv.includes('--check');
const names = readdirSync(
  fileURLToPath(new URL('../src/plugins/', import.meta.url)),
  { withFileTypes: true },
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let failed = false;
const fail = (message: string) => {
  failed = true;
  // In GitHub Actions, an error on the run's page, not only in its log.
  const prefix = process.env.GITHUB_ACTIONS ? '::error::' : '';
  process.stdout.write(`${prefix}${message}\n`);
};

for (const name of names) {
  const hash = builtHash(bundleFile(name));
  if (hash === null) {
    fail(`dist/plugin/${name}.mjs is not built`);
    continue;
  }
  process.stdout.write(`${hash}  dist/plugin/${name}.mjs\n`);
  const standing = await Effect.runPromise(
    readLog(logFile(name)).pipe(
      Effect.flatMap((log) => checkBuild(log, hash)),
      Effect.match({
        onFailure: (error) => ({ latest: false, said: error.message }),
        onSuccess: () => ({
          latest: true,
          said: `It is the latest Release of the ${name} Plugin.`,
        }),
      }),
    ),
  );
  if (check && !standing.latest) fail(standing.said);
  else process.stdout.write(`${standing.said}\n`);
}

if (failed) process.exitCode = 1;
