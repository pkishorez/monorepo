import { Console, Data, Effect, Runtime } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { analyzeSnapshots } from '../shared/schema-snapshots/index.js';
import { renderLintReport } from './render-report.js';

export class LintFailure extends Data.TaggedError('LintFailure')<{
  readonly message: string;
}> {
  readonly [Runtime.errorExitCode] = 1;
  readonly [Runtime.errorReported] = false;
}

const rootFlag = Flag.string('root').pipe(
  Flag.withDescription('Schema collection root to lint'),
);

export const lintCommand = Command.make(
  'lint',
  {
    root: rootFlag,
  },
  ({ root }) =>
    Effect.gen(function* () {
      const report = yield* analyzeSnapshots(root);
      const output = renderLintReport(report);
      yield* Console.log(output.text);
      if (output.exitCode !== 0) {
        yield* Effect.fail(
          new LintFailure({ message: 'Snapshot lint failed' }),
        );
      }
    }),
).pipe(Command.withDescription('Lint approved schema version snapshots'));
