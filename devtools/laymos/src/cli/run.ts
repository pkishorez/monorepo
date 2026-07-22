import { Duration, Effect, FileSystem, Option, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { analyzeProject, runStories, runStoryGroup } from '../node.js';
import type { StoriesRunResult, StoryRunOptions } from '../node.js';
import type { LaymosReport, Violation } from '../report/index.js';
import type {
  ExecutionPath,
  StoryArm,
  StoryRun,
  StorySelectedArm,
} from '../report/stories.js';
import { ejectStories } from '../story/eject/index.js';

class CliExit {
  readonly _tag = 'CliExit';
}

const paint =
  (stream: NodeJS.WriteStream, code: string) =>
  (text: string): string =>
    stream.isTTY && process.env['NO_COLOR'] === undefined
      ? `\x1b[${code}m${text}\x1b[0m`
      : text;

const green = paint(process.stdout, '32');
const yellow = paint(process.stdout, '33');
const red = paint(process.stderr, '31');

export function lintPasses(report: Pick<LaymosReport, 'violations'>): boolean {
  return report.violations.length === 0;
}

function lint(): Effect.Effect<void, CliExit> {
  return analyzeProject(process.cwd()).pipe(
    Effect.flatMap((report) =>
      Effect.suspend(() => {
        reportCoverage(report);
        reportWarnings(report);
        if (lintPasses(report)) {
          process.stdout.write(green('No violations found.\n'));
          return Effect.void;
        }
        reportViolations(report.violations);
        return Effect.fail(new CliExit());
      }),
    ),
    Effect.catch((error) =>
      error instanceof CliExit
        ? Effect.fail(error)
        : Effect.sync(() => {
            process.stderr.write(red(`Error: ${errorMessage(error)}\n`));
          }).pipe(Effect.andThen(Effect.fail(new CliExit()))),
    ),
  );
}

function stories(
  files: readonly string[],
  timeout: Option.Option<string>,
  group: Option.Option<string>,
): Effect.Effect<void, CliExit> {
  return Effect.suspend(() => {
    let options: StoryRunOptions;
    let selectedGroupPath: readonly string[] | undefined;
    try {
      options = storyRunOptions(timeout);
      selectedGroupPath = Option.isSome(group)
        ? groupPath(group.value)
        : undefined;
    } catch (error) {
      process.stderr.write(red(`Error: ${errorMessage(error)}\n`));
      return Effect.fail(new CliExit());
    }
    if (Option.isSome(group) && files.length > 0) {
      process.stderr.write(
        red('Error: --group cannot be combined with Story file arguments\n'),
      );
      return Effect.fail(new CliExit());
    }
    const run = selectedGroupPath
      ? runStoryGroup(process.cwd(), selectedGroupPath, options)
      : runStories(process.cwd(), files, options);
    return run.pipe(
      Effect.flatMap((result) =>
        Effect.suspend(() => {
          reportStoriesRun(result);
          if (result.status === 'passed') return Effect.void;
          return Effect.fail(new CliExit());
        }),
      ),
      Effect.catch((error) =>
        error instanceof CliExit
          ? Effect.fail(error)
          : Effect.sync(() => {
              process.stderr.write(red(`Error: ${errorMessage(error)}\n`));
            }).pipe(Effect.andThen(Effect.fail(new CliExit()))),
      ),
    );
  });
}

function eject(
  dryRun: boolean,
): Effect.Effect<void, CliExit, FileSystem.FileSystem | Path.Path> {
  return ejectStories(process.cwd(), { dryRun }).pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        const prefix = result.dryRun ? 'Would rewrite' : 'Rewrote';
        const deletePrefix = result.dryRun ? 'Would delete' : 'Deleted';
        for (const file of result.changed) {
          process.stdout.write(`${prefix} ${file}\n`);
        }
        for (const file of result.deleted) {
          process.stdout.write(`${deletePrefix} ${file}\n`);
        }
        if (result.changed.length === 0 && result.deleted.length === 0) {
          process.stdout.write('No Laymos Stories found to eject.\n');
        }
      }),
    ),
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(red(`Error: ${errorMessage(error)}\n`));
      }).pipe(Effect.andThen(Effect.fail(new CliExit()))),
    ),
  );
}

function groupPath(input: string): readonly string[] {
  const path = input.split('/').map((segment) => segment.trim());
  if (path.length === 0 || path.some((segment) => segment.length === 0)) {
    throw new Error(
      `Invalid --group "${input}"; use a path such as "DynamoDB / Entities"`,
    );
  }
  return path;
}

function storyRunOptions(timeout: Option.Option<string>): StoryRunOptions {
  if (Option.isNone(timeout)) return {};
  const input = timeout.value as Duration.Input;
  let millis: number;
  try {
    millis = Duration.toMillis(input);
  } catch {
    millis = Number.NaN;
  }
  if (!Number.isFinite(millis) || millis <= 0) {
    throw new Error(
      `Invalid --timeout "${timeout.value}"; use a duration such as "90 seconds"`,
    );
  }
  return { timeout: input };
}

function reportStoriesRun(result: StoriesRunResult): void {
  const stories = Object.entries(result.runs.stories);
  process.stdout.write(
    `${stories.length} ${stories.length === 1 ? 'Story' : 'Stories'} executed.\n`,
  );
  for (const [storyId, artifact] of stories) {
    reportStory(storyId, artifact);
  }
  for (const failure of result.failures) {
    const scope =
      failure.scenario === undefined
        ? failure.storyId
        : `${failure.storyId} › ${failure.scenario}`;
    const phase = failure.phase === undefined ? '' : ` [${failure.phase}]`;
    process.stderr.write(red(`  - ${scope}${phase}: ${failure.message}\n`));
  }
  if (result.status === 'passed') {
    process.stdout.write(green('All Scenarios passed.\n'));
    return;
  }
  process.stderr.write(red('Some Scenarios failed or were interrupted.\n'));
}

function reportStory(storyId: string, artifact: StoryRun): void {
  const passed = artifact.scenarios.every(
    ({ outcome }) => outcome === 'succeeded' || outcome === 'skipped',
  );
  process.stdout.write(
    `\n${passed ? green('✓') : red('×')} ${artifact.name} ${paintMuted(`(${storyId})`)}\n`,
  );
  for (const scenario of artifact.scenarios) {
    const icon =
      scenario.outcome === 'succeeded'
        ? green('✓')
        : scenario.outcome === 'skipped'
          ? paintMuted('○')
          : scenario.outcome === 'interrupted'
            ? yellow('!')
            : red('×');
    const timing =
      scenario.durationMillis === undefined
        ? ''
        : paintMuted(` ${scenario.durationMillis}ms`);
    process.stdout.write(`  ${icon} ${scenario.name}${timing}\n`);
    reportUnsuccessfulPaths(artifact, scenario.execution);
  }
  reportDecisionGaps(artifact);
}

function reportUnsuccessfulPaths(
  artifact: StoryRun,
  execution: ExecutionPath,
  parents: readonly string[] = [],
): void {
  for (const item of execution) {
    if ('parallel' in item) {
      for (const branch of item.parallel) {
        reportUnsuccessfulPaths(artifact, branch, parents);
      }
      continue;
    }
    const name = artifact.blocks[item.blockId]?.name ?? item.blockId;
    const path = [...parents, name];
    if (item.outcome !== 'succeeded') {
      process.stdout.write(
        `    ${yellow(item.outcome)}: ${path.join(' › ')}\n`,
      );
    }
    reportUnsuccessfulPaths(artifact, item.children, path);
  }
}

function reportDecisionGaps(artifact: StoryRun): void {
  for (const [blockId, block] of Object.entries(artifact.blocks)) {
    if (block.kind !== 'decision') continue;
    const observed = new Set<string>();
    for (const scenario of artifact.scenarios) {
      collectSelectedArms(scenario.execution, blockId, observed);
    }
    const missing = block.arms.filter(
      (arm) => !observed.has(selectedArmKey(arm)),
    );
    if (missing.length === 0) continue;
    const location = `${block.location.file}:${block.location.line}:${block.location.column}`;
    process.stdout.write(
      `  ${paintMuted('decision')} ${block.name}: ${block.arms.length - missing.length}/${block.arms.length} arms observed ${paintMuted(`(${location})`)}\n`,
    );
    process.stdout.write(
      `    unobserved: ${missing.map((arm) => arm.name).join(', ')}\n`,
    );
  }
}

function collectSelectedArms(
  execution: ExecutionPath,
  blockId: string,
  observed: Set<string>,
): void {
  for (const item of execution) {
    if ('parallel' in item) {
      for (const branch of item.parallel) {
        collectSelectedArms(branch, blockId, observed);
      }
      continue;
    }
    if (item.blockId === blockId && item.selectedArm !== undefined) {
      observed.add(selectedArmKey(item.selectedArm));
    }
    collectSelectedArms(item.children, blockId, observed);
  }
}

function selectedArmKey(arm: StoryArm | StorySelectedArm): string {
  return arm.kind === 'otherwise'
    ? 'otherwise'
    : `literal:${typeof arm.value}:${String(arm.value)}`;
}

const paintMuted = paint(process.stdout, '2');

function reportCoverage(report: LaymosReport): void {
  const ignored = Object.values(report.files).filter(
    (file) => file.kind === 'ignored',
  ).length;
  const layerCoverage = report.coverage.layers;
  const moduleTotal = report.coverage.modules.reduce(
    (total, coverage) => total + coverage.totalFiles,
    0,
  );
  const moduleCovered = report.coverage.modules.reduce(
    (total, coverage) => total + coverage.coveredFiles,
    0,
  );
  const ignoredSuffix = ignored > 0 ? ` (${ignored} ignored)` : '';

  process.stdout.write(
    [
      `Scanned ${layerCoverage.totalFiles} source file(s)${ignoredSuffix}.`,
      `Layers: ${layerCoverage.coveredFiles}/${layerCoverage.totalFiles} file(s) covered.`,
      `Modules: ${moduleCovered}/${moduleTotal} layer-covered file(s) covered.`,
    ].join('\n') + '\n',
  );

  if (layerCoverage.uncovered.length > 0) {
    writeWarningList(
      'file(s) not covered by any layer',
      layerCoverage.uncovered,
    );
  }
  for (const coverage of report.coverage.modules) {
    if (coverage.uncovered.length > 0) {
      writeWarningList(
        `file(s) in layer "${coverage.layer}" not covered by a module`,
        coverage.uncovered,
      );
    }
  }
}

function reportWarnings(report: LaymosReport): void {
  for (const warning of report.warnings) {
    const detail =
      warning.kind === 'missing-source-root'
        ? `source root does not exist: ${warning.path}`
        : warning.kind === 'missing-layer-path'
          ? `layer "${warning.layer}" path does not exist: ${warning.path}`
          : `module path does not exist: ${warning.path}`;
    process.stdout.write(yellow(`warning: ${detail}\n`));
  }
}

function writeWarningList(title: string, files: readonly string[]): void {
  process.stdout.write(yellow(`warning: ${files.length} ${title}:\n`));
  for (const file of files) process.stdout.write(yellow(`  - ${file}\n`));
}

function reportViolations(violations: readonly Violation[]): void {
  process.stderr.write(
    red(`Found ${violations.length} architecture violation(s):\n`),
  );
  for (const violation of violations) {
    if (violation.kind === 'layer') {
      process.stderr.write(
        red(`  - [layer] ${violation.from.layer} -> ${violation.to.layer}\n`),
      );
    } else {
      process.stderr.write(
        red(
          `  - [${violation.rule}] ${violation.from.module} -> ${violation.to.module}\n`,
        ),
      );
    }
    process.stderr.write(
      red(`    ${violation.from.file} -> ${violation.to.file}\n`),
    );
  }
  process.stderr.write(
    red(`Lint failed: ${violations.length} violation(s).\n`),
  );
}

function errorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    error.cause !== undefined
  ) {
    return errorMessage(error.cause);
  }
  return error instanceof Error ? error.message : String(error);
}

const lintCommand = Command.make('lint', {}, lint).pipe(
  Command.withDescription(
    'Check the project against its declared architecture. Coverage gaps are warnings only.',
  ),
);

const ejectCommand = Command.make(
  'eject',
  {
    dryRun: Flag.boolean('dry-run').pipe(
      Flag.withDescription(
        'Preview rewritten and deleted files without changing them.',
      ),
    ),
  },
  ({ dryRun }) => eject(dryRun),
).pipe(
  Command.withDescription(
    'Remove Story instrumentation and delete Laymos Story files across the current project.',
  ),
);

const storiesCommand = Command.make(
  'stories',
  {
    stories: Argument.string('story').pipe(Argument.variadic()),
    timeout: Flag.string('timeout').pipe(
      Flag.optional,
      Flag.withDescription(
        'Default Scenario timeout for this run, e.g. "90 seconds".',
      ),
    ),
    group: Flag.string('group').pipe(
      Flag.optional,
      Flag.withDescription(
        'Run one Story Group subtree, e.g. "DynamoDB / Entities".',
      ),
    ),
  },
  ({ stories: files, timeout, group }) => stories(files, timeout, group),
).pipe(
  Command.withDescription(
    'Run Story files or one --group subtree (all Stories by default) and print fresh execution evidence.',
  ),
  Command.withSubcommands([ejectCommand]),
);

export const command = Command.make('laymos', {}, () => Effect.void).pipe(
  Command.withSubcommands([lintCommand, storiesCommand]),
);

export const cli = command.pipe(Command.run({ version: '0.0.0' }));
