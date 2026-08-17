import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';
import { Snapshot } from '../../snapshot/index.js';
import {
  loadContract,
  readBaseline,
  writeBaseline,
} from '../contract-files/index.js';
import {
  joinSections,
  renderApproval,
  renderDiagnostics,
  renderDriftHint,
  renderMissingBaseline,
} from './report.js';

interface SnapshotOutcome {
  readonly exitCode: number;
  readonly output: string;
}

export function verifySnapshot(cwd: string) {
  return Effect.gen(function* () {
    const [current, baseline] = yield* Effect.all(
      [loadContract(cwd), readBaseline(cwd)],
      { concurrency: 2 },
    );
    const diagnostics = renderDiagnostics(current);
    if (baseline === undefined) {
      return {
        exitCode: 1,
        output: joinSections(renderMissingBaseline(), diagnostics),
      };
    }
    const changes = Snapshot.diff(baseline, current);
    const summary = Snapshot.renderChanges(changes);
    if (changes.length === 0) {
      return { exitCode: 0, output: joinSections(summary, diagnostics) };
    }
    return {
      exitCode: 1,
      output: joinSections(summary, diagnostics, renderDriftHint()),
    };
  });
}

export function approveSnapshot(cwd: string) {
  return Effect.gen(function* () {
    const [current, baseline] = yield* Effect.all(
      [loadContract(cwd), readBaseline(cwd, { discardRetired: true })],
      { concurrency: 2 },
    );
    yield* writeBaseline(cwd, current);
    return {
      exitCode: 0,
      output: joinSections(
        renderApproval(baseline === undefined),
        renderDiagnostics(current),
      ),
    };
  });
}

export function viewSnapshot(cwd: string) {
  return loadContract(cwd).pipe(
    Effect.map((current) => ({
      exitCode: 0,
      output: joinSections(
        Snapshot.render(current),
        renderDiagnostics(current),
      ),
    })),
  );
}

export function makeSnapshotCommand<R>(cwd: Effect.Effect<string, never, R>) {
  const run = <E, S>(
    command: (cwd: string) => Effect.Effect<SnapshotOutcome, E, S>,
  ) => cwd.pipe(Effect.flatMap(command), Effect.flatMap(report));
  return Command.make('snapshot', {}, () => run(verifySnapshot)).pipe(
    Command.withDescription(
      'Verify the database contract against the approved snapshot.',
    ),
    Command.withSubcommands([
      Command.make('verify', {}, () => run(verifySnapshot)).pipe(
        Command.withDescription(
          'Report how the database contract differs from the approved snapshot.',
        ),
      ),
      Command.make('approve', {}, () => run(approveSnapshot)).pipe(
        Command.withDescription(
          'Write the current database contract as the approved snapshot.',
        ),
      ),
      Command.make('view', {}, () => run(viewSnapshot)).pipe(
        Command.withDescription('Print the current database contract in full.'),
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
