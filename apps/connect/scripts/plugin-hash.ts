import { Effect } from 'effect';
import {
  builtHash,
  bundleFile,
  checkBuild,
  logFile,
  readLog,
} from '../infra/releases/release-log/index.ts';

/*
 * Prints the sha256 of the code Plugin's build, the hash a deploy names,
 * and whether it is the latest Release in its Release Log, as a deployed
 * Stage requires. With `--check`, a build that is not fails: the deploy chain
 * runs it before it deploys.
 */

const check = process.argv.includes('--check');

const hash = builtHash(bundleFile('code'));
if (hash === null) throw new Error('dist/plugin/code.mjs is not built');
process.stdout.write(`${hash}  dist/plugin/code.mjs\n`);

const problem = await Effect.runPromise(
  readLog(logFile('code')).pipe(
    Effect.flatMap((log) => checkBuild(log, hash)),
    Effect.match({
      onFailure: (error) => error.message,
      onSuccess: () => null,
    }),
  ),
);
process.stdout.write(
  `${problem ?? 'It is the latest Release of the code Plugin.'}\n`,
);
if (check && problem !== null) process.exitCode = 1;
