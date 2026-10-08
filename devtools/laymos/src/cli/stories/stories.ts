import { Console, Effect, Option, Stream } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

import { planStories } from '../../orchestrator/run-stories/index.js';
import type { ProofReport, ProofRunEvent } from '../../story/schema/index.js';
import { storiesOf } from '../../story/story-tree/index.js';
import { startProgress } from './progress.js';
import { renderStoryRun, renderSummary } from './report.js';

const scopeArgument = Argument.String('scope').pipe(
  Argument.withDescription(
    'A Story id (that Story and everything beneath it) or a Proof id; every Proof when absent.',
  ),
  Argument.optional,
);

const concurrencyFlag = Flag.Int('concurrency').pipe(
  Flag.withAlias('c'),
  Flag.withDefault(16),
  Flag.withDescription(
    'How many process Proofs run at once. Browser Proofs run two at a time.',
  ),
);

export function makeStoriesCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make(
    'stories',
    { scope: scopeArgument, concurrency: concurrencyFlag },
    ({ scope, concurrency }) =>
      configPath.pipe(
        Effect.flatMap((path) =>
          runScope(path, Option.getOrUndefined(scope), concurrency),
        ),
      ),
  ).pipe(
    Command.withDescription(
      'Run the Proofs in a scope and report each verdict on the Story tree.',
    ),
  );
}

function runScope(
  configPath: string,
  scope: string | undefined,
  concurrency: number,
) {
  return Effect.gen(function* () {
    const run = yield* planStories(configPath, { scope, concurrency });
    const reports = yield* collectReports(run.events, run.total);
    yield* Console.log(renderStoryRun(run.tree, reports));
    const issues = storiesOf(run.tree).reduce(
      (sum, story) => sum + story.issues.length,
      0,
    );
    yield* Console.log(`\n${renderSummary(reports, run.total, issues)}`);
    if (
      reports.length < run.total ||
      reports.some((report) => report.verdict !== 'passed')
    ) {
      process.exitCode = 1;
    }
  });
}

function collectReports(
  events: Stream.Stream<ProofRunEvent>,
  total: number,
): Effect.Effect<readonly ProofReport[]> {
  return Effect.suspend(() => {
    const reports: ProofReport[] = [];
    const progress = startProgress(total);
    return events.pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => {
          if (event._tag === 'Finished') {
            reports.push(event.report);
            progress.record(event.report.verdict);
          }
        }),
      ),
      Effect.ensuring(Effect.sync(progress.stop)),
      Effect.as(reports),
    );
  });
}
