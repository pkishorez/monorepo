import { Console, Effect, Stream } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { planStories } from '../../orchestrator/run-stories/index.js';
import type { StoryReport } from '../../story/schema/index.js';
import { startProgress } from './progress.js';
import { renderStoryReports, renderSummary } from './report.js';

const concurrencyFlag = Flag.integer('concurrency').pipe(
  Flag.withAlias('c'),
  Flag.withDefault(16),
  Flag.withDescription('How many Stories run at once.'),
);

export function makeStoriesCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make(
    'stories',
    { concurrency: concurrencyFlag },
    ({ concurrency }) =>
      configPath.pipe(
        Effect.flatMap((path) => runAllStories(path, concurrency)),
      ),
  ).pipe(
    Command.withDescription(
      'Run every Story in the Story tree and report each verdict.',
    ),
  );
}

function runAllStories(configPath: string, concurrency: number) {
  return Effect.gen(function* () {
    const { total, reports } = yield* planStories(configPath, { concurrency });
    const collected = yield* collectReports(reports, total);
    yield* Console.log(renderStoryReports(collected));
    yield* Console.log(`\n${renderSummary(collected, total)}`);
    if (collected.some((report) => report.verdict !== 'passed')) {
      process.exitCode = 1;
    }
  });
}

function collectReports(
  reports: Stream.Stream<StoryReport>,
  total: number,
): Effect.Effect<readonly StoryReport[]> {
  return Effect.suspend(() => {
    const collected: StoryReport[] = [];
    const progress = startProgress(total);
    return reports.pipe(
      Stream.runForEach((report) =>
        Effect.sync(() => {
          collected.push(report);
          progress.record(report.verdict);
        }),
      ),
      Effect.ensuring(Effect.sync(progress.stop)),
      Effect.as(collected),
    );
  });
}
