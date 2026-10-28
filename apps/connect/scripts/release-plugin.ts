import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import {
  appendRelease,
  builtHash,
  bundleFile,
  logFile,
  readLog,
  writeLog,
} from '../infra/plugins/release-log/index.ts';

/*
 * `pnpm release:plugin <name> "<summary>"`: builds the Plugins, then
 * appends the build of `name` to its Release Log as its latest Release,
 * with what changed. A build already in the Log is refused: nothing
 * changed. Commit releases.json with the change it releases.
 */

const [name, summary] = process.argv.slice(2);
if (name === undefined || summary === undefined || summary.trim() === '') {
  process.stderr.write('Usage: pnpm release:plugin <name> "<what changed>"\n');
  process.exit(1);
}

execFileSync('vp', ['pack'], { stdio: 'inherit' });

const released = Effect.gen(function* () {
  const file = logFile(name);
  const hash = builtHash(bundleFile(name));
  if (hash === null)
    return yield* Effect.fail(new Error(`No build of the ${name} Plugin`));
  const log = yield* readLog(file);
  yield* writeLog(
    file,
    yield* appendRelease(log, { hash, summary: summary.trim() }),
  );
  return `Released the ${name} Plugin, ${hash}: ${summary.trim()}`;
});

await Effect.runPromise(
  Effect.match(released, {
    onFailure: (error) => {
      process.exitCode = 1;
      return error.message;
    },
    onSuccess: (said) => said,
  }),
).then((said) => process.stdout.write(`${said}\n`));
