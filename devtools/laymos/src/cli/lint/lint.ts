import { Console, Effect } from 'effect';
import { Command } from 'effect/cli';

import { violationsOf } from '../../domain/architecture-analysis/index.js';
import { analyzeProject } from '../../orchestrator/analyze-project/index.js';
import {
  findSelfContainedViolations,
  findTellingIssues,
} from '../../orchestrator/run-stories/index.js';
import { renderLintReport } from './report.js';
import {
  renderSelfContainedReport,
  renderTellingReport,
} from './stories/report.js';

export function makeLintCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('lint', {}, () =>
    configPath.pipe(Effect.flatMap(runLint)),
  ).pipe(
    Command.withDescription(
      'Check every import against the Rules and Exceptions, and every Story.',
    ),
  );
}

function runLint(configPath: string) {
  return Effect.gen(function* () {
    const analysis = yield* analyzeProject(configPath);
    yield* Console.log(renderLintReport(analysis));
    const storyIssues = yield* lintStories(configPath);
    const coverage = analysis.findings.filter(
      ({ kind }) => kind === 'wrapper-coverage',
    );
    if (
      violationsOf(analysis).length > 0 ||
      coverage.length > 0 ||
      storyIssues > 0
    ) {
      process.exitCode = 1;
    }
  });
}

// A project without a Stories path has no Stories to lint.
function lintStories(configPath: string) {
  return Effect.gen(function* () {
    const issues = yield* findTellingIssues(configPath);
    yield* Console.log(renderTellingReport(issues));
    const violations = yield* findSelfContainedViolations(configPath);
    yield* Console.log(renderSelfContainedReport(violations));
    return issues.length + violations.length;
  }).pipe(
    Effect.catchTag('StoriesError', (error) =>
      error.reason === 'no-stories-path'
        ? Effect.succeed(0)
        : Effect.die(error),
    ),
  );
}
