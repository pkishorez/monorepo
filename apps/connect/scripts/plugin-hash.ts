import { Effect } from 'effect';
import {
  builtHash,
  bundleFile,
  checkBuild,
  logFile,
  PLUGIN_NAMES,
  readLog,
} from '../infra/plugins/release-log/index.ts';

/*
 * Prints the sha256 of each Plugin's build, the hash a deploy names, and
 * whether it is the latest Release in its Release Log, as a deployed Stage
 * requires.
 */

for (const name of PLUGIN_NAMES) {
  const hash = builtHash(bundleFile(name));
  if (hash === null) throw new Error(`dist/plugin/${name}.mjs is not built`);
  process.stdout.write(`${hash}  dist/plugin/${name}.mjs\n`);

  const standing = await Effect.runPromise(
    readLog(logFile(name)).pipe(
      Effect.flatMap((log) => checkBuild(log, hash)),
      Effect.match({
        onFailure: (error) => error.message,
        onSuccess: () => `It is the latest Release of the ${name} Plugin.`,
      }),
    ),
  );
  process.stdout.write(`${standing}\n`);
}
