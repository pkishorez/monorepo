import { Console, Effect, Stream } from 'effect';
import { Command } from 'effect/unstable/cli';

import { runStories } from '../../orchestrator/run-stories/index.js';
import type { StoryReport } from '../../story/schema/index.js';

export function makeStoriesCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('stories', {}, () =>
    configPath.pipe(Effect.flatMap(runAllStories)),
  ).pipe(
    Command.withDescription(
      'Run every Story in the Story tree and report each verdict.',
    ),
  );
}

function runAllStories(configPath: string) {
  return Effect.gen(function* () {
    let allPassed = true;
    yield* runStories(configPath).pipe(
      Stream.runForEach((report) =>
        Effect.gen(function* () {
          if (report.verdict !== 'passed') allPassed = false;
          yield* Console.log(renderReport(report));
        }),
      ),
    );
    if (!allPassed) {
      process.exitCode = 1;
    }
  });
}

const verdictMarks = {
  passed: '✓',
  failed: '✗',
  errored: '!',
} as const;

function renderReport(report: StoryReport): string {
  const depth = report.id.split('/').length - 1;
  const pad = '  '.repeat(depth);
  const title = report.id.split('/').at(-1) ?? report.id;
  const lines = [
    `${pad}${verdictMarks[report.verdict]} ${title} — ${report.verdict} (${report.questions.length} question${report.questions.length === 1 ? '' : 's'})`,
  ];
  for (const question of report.questions) {
    lines.push(`${pad}  ${verdictMarks[question.verdict]} ${question.slug}`);
    for (const assertion of question.assertions) {
      lines.push(
        `${pad}    ${assertion.passed ? '✓' : '✗'} ${assertion.description}`,
      );
    }
    if (question.error !== undefined) {
      lines.push(indent(question.error, `${pad}    `));
    }
  }
  return lines.join('\n');
}

function indent(text: string, pad: string): string {
  return text
    .split('\n')
    .map((line) => `${pad}${line}`)
    .join('\n');
}
