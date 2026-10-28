import { Effect } from 'effect';
import {
  builtHash,
  bundleFile,
  checkBuild,
  logFile,
  readLog,
} from '../infra/plugins/release-log/index.ts';

/*
 * Prints the sha256 of the code Plugin's build, the hash a deploy names,
 * and whether it is the latest Release in its Release Log, as a deployed
 * Stage requires.
 */

const hash = builtHash(bundleFile('code'));
if (hash === null) throw new Error('dist/plugin/code.mjs is not built');
process.stdout.write(`${hash}  dist/plugin/code.mjs\n`);

const standing = await Effect.runPromise(
  readLog(logFile('code')).pipe(
    Effect.flatMap((log) => checkBuild(log, hash)),
    Effect.match({
      onFailure: (error) => error.message,
      onSuccess: () => 'It is the latest Release of the code Plugin.',
    }),
  ),
);
process.stdout.write(`${standing}\n`);
