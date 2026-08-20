import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';
import { Snapshot } from '../../snapshot/index.js';
import {
  loadContract,
  readBaseline,
  writeBaseline,
} from '../contract-files/index.js';
import {
  renderSnapshotResult,
  type SnapshotCommandResult,
  type SnapshotOutcome,
} from './report.js';

export function verifySnapshot(cwd: string) {
  return Effect.gen(function* () {
    const [current, baseline] = yield* Effect.all(
      [loadContract(cwd), readBaseline(cwd)],
      { concurrency: 2 },
    );
    if (baseline === undefined) {
      return {
        _tag: 'MissingBaseline',
      } as const satisfies SnapshotCommandResult;
    }
    const changes = Snapshot.diff(baseline, current);
    const limitations = Snapshot.inspect(current);
    return (
      changes.length === 0
        ? { _tag: 'Match', limitations }
        : { _tag: 'Drift', changes, limitations }
    ) satisfies SnapshotCommandResult;
  });
}

export function approveSnapshot(cwd: string) {
  return Effect.gen(function* () {
    const [current, baseline] = yield* Effect.all(
      [loadContract(cwd), readBaseline(cwd)],
      { concurrency: 2 },
    );
    if (baseline === undefined) {
      yield* writeBaseline(cwd, current);
      return { _tag: 'Created' } as const satisfies SnapshotCommandResult;
    }
    const changes = Snapshot.diff(baseline, current);
    const limitations = Snapshot.inspect(current);
    if (changes.length === 0) {
      return {
        _tag: 'Unchanged',
        limitations,
      } as const satisfies SnapshotCommandResult;
    }
    yield* writeBaseline(cwd, current);
    return {
      _tag: 'Updated',
      changes,
      limitations,
    } as const satisfies SnapshotCommandResult;
  });
}

export function makeSnapshotCommand<R>(cwd: Effect.Effect<string, never, R>) {
  const run = <E, S>(
    command: (cwd: string) => Effect.Effect<SnapshotCommandResult, E, S>,
  ) =>
    cwd.pipe(
      Effect.flatMap(command),
      Effect.map(renderSnapshotResult),
      Effect.flatMap(report),
    );
  return Command.make('snapshot', {}, () => run(verifySnapshot)).pipe(
    Command.withDescription(
      'Verify the database contract against the approved snapshot.',
    ),
    Command.withSubcommands([
      Command.make('approve', {}, () => run(approveSnapshot)).pipe(
        Command.withDescription(
          'Write the current database contract as the approved snapshot.',
        ),
      ),
    ]),
  );
}

function report(outcome: SnapshotOutcome) {
  return Console.log(outcome.output).pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        if (outcome.exitCode !== 0) process.exitCode = outcome.exitCode;
      }),
    ),
  );
}
