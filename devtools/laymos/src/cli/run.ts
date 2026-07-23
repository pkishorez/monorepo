import { Duration, Effect, FileSystem, Option, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { analyzeProject, getStories, runStories } from '../node.js';
import type { StoriesRunResult, StoryRunOptions } from '../node.js';
import type { LaymosReport, Violation } from '../report/index.js';
import type {
  ExecutionPath,
  StoryArm,
  StoryRun,
  StorySelectedArm,
} from '../report/stories.js';
import {
  ejectStories,
  planStoryEjection,
  validateProjectStoryAuthoring,
} from '../story/eject/index.js';
import {
  projectStoryCoverage,
  type StoryCoverageReport,
} from '../story/coverage/index.js';

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

type StoryLintResult =
  | { readonly _tag: 'NoStories' }
  | { readonly _tag: 'Coverage'; readonly report: StoryCoverageReport }
  | { readonly _tag: 'Unavailable'; readonly message: string };

function lint(
  verbose: boolean,
): Effect.Effect<void, CliExit, FileSystem.FileSystem | Path.Path> {
  return validateProjectStoryAuthoring(process.cwd()).pipe(
    Effect.andThen(
      Effect.all({
        report: analyzeProject(process.cwd()),
        stories: inspectStories(),
      }),
    ),
    Effect.flatMap(({ report, stories }) =>
      Effect.suspend(() => {
        reportCoverage(report);
        reportStoryLint(stories, false, verbose);
        reportWarnings(report);
        if (lintPasses(report) && storyLintPasses(stories)) {
          process.stdout.write(green('No violations found.\n'));
          return Effect.void;
        }
        if (!lintPasses(report)) reportViolations(report.violations);
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

function lintStories(
  verbose: boolean,
): Effect.Effect<void, CliExit, FileSystem.FileSystem | Path.Path> {
  return validateProjectStoryAuthoring(process.cwd()).pipe(
    Effect.andThen(inspectStories()),
    Effect.flatMap((result) =>
      Effect.suspend(() => {
        reportStoryLint(result, true, verbose);
        return storyLintPasses(result)
          ? Effect.void
          : Effect.fail(new CliExit());
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

function inspectStories(): Effect.Effect<
  StoryLintResult,
  never,
  FileSystem.FileSystem | Path.Path
> {
  return getStories(process.cwd()).pipe(
    Effect.flatMap((stories) => {
      if (
        stories.catalog.modules.every((module) => module.stories.length === 0)
      ) {
        return Effect.succeed<StoryLintResult>({ _tag: 'NoStories' });
      }
      return planStoryEjection(process.cwd()).pipe(
        Effect.flatMap((ejection) =>
          Effect.try({
            try: () => projectStoryCoverage(process.cwd(), stories, ejection),
            catch: (error) => error,
          }),
        ),
        Effect.map((report): StoryLintResult => ({ _tag: 'Coverage', report })),
      );
    }),
    Effect.catch((error) =>
      Effect.succeed<StoryLintResult>({
        _tag: 'Unavailable',
        message: errorMessage(error),
      }),
    ),
  );
}

function storyLintPasses(result: StoryLintResult): boolean {
  return (
    result._tag === 'NoStories' ||
    (result._tag === 'Coverage' && result.report.invalidStories.length === 0)
  );
}

function stories(
  selectors: readonly string[],
  timeout: Option.Option<string>,
): Effect.Effect<void, CliExit> {
  return Effect.suspend(() => {
    let options: StoryRunOptions;
    try {
      options = storyRunOptions(timeout);
    } catch (error) {
      process.stderr.write(red(`Error: ${errorMessage(error)}\n`));
      return Effect.fail(new CliExit());
    }
    return runStories(process.cwd(), selectors, options).pipe(
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
  for (const [, artifact] of stories) {
    reportStory(artifact);
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

function reportStory(artifact: StoryRun): void {
  const passed = artifact.scenarios.every(
    ({ outcome }) => outcome === 'succeeded' || outcome === 'skipped',
  );
  process.stdout.write(
    `\n${passed ? green('✓') : red('×')} ${artifact.name}\n`,
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
    process.stdout.write(`  ${icon} ${scenario.name}\n`);
  }
  reportRuntimeCoverage(artifact);
}

function reportRuntimeCoverage(artifact: StoryRun): void {
  const blockCoverage = scenarioNodeCoverage(artifact);
  const armCoverage = decisionArmCoverage(artifact);
  const parts = [
    `${blockCoverage.visited}/${blockCoverage.total} Blocks (${formatPercentage(blockCoverage.percentage)})`,
  ];
  if (armCoverage.total > 0) {
    parts.push(`${armCoverage.visited}/${armCoverage.total} Decision Arms`);
  }
  process.stdout.write(`  Coverage: ${parts.join(' · ')}\n`);

  const unvisitedBlocks = unvisitedBlockNames(artifact);
  if (unvisitedBlocks.length > 0) {
    process.stdout.write(
      `  Unvisited ${unvisitedBlocks.length === 1 ? 'Block' : 'Blocks'}: ${unvisitedBlocks.join('; ')}\n`,
    );
  }

  const unvisitedArms = unvisitedDecisionArmNames(artifact);
  if (unvisitedArms.length > 0) {
    process.stdout.write(
      `  Unvisited Decision ${unvisitedArms.length === 1 ? 'Arm' : 'Arms'}: ${unvisitedArms.join('; ')}\n`,
    );
  }
}

function unvisitedBlockNames(artifact: StoryRun): readonly string[] {
  const visited = visitedBlockIds(artifact);
  return Object.entries(artifact.blocks)
    .filter(([blockId]) => !visited.has(blockId))
    .map(([, block]) => block.name);
}

function unvisitedDecisionArmNames(artifact: StoryRun): readonly string[] {
  const names: string[] = [];
  for (const [blockId, block] of Object.entries(artifact.blocks)) {
    if (block.kind !== 'decision') continue;
    const observed = new Set<string>();
    for (const scenario of artifact.scenarios) {
      collectSelectedArms(scenario.execution, blockId, observed);
    }
    for (const arm of block.arms) {
      if (!observed.has(selectedArmKey(arm))) {
        names.push(`${block.name} › ${arm.name}`);
      }
    }
  }
  return names;
}

function scenarioNodeCoverage(
  artifact: StoryRun,
): NonNullable<StoryRun['scenarioNodeCoverage']> {
  if (artifact.scenarioNodeCoverage !== undefined) {
    return artifact.scenarioNodeCoverage;
  }
  const visited = visitedBlockIds(artifact);
  const total = Object.keys(artifact.blocks).length;
  const percentage = total === 0 ? 0 : (visited.size / total) * 100;
  return { visited: visited.size, total, percentage };
}

function visitedBlockIds(artifact: StoryRun): ReadonlySet<string> {
  const visited = new Set<string>();
  for (const scenario of artifact.scenarios) {
    collectVisitedBlocks(scenario.execution, visited);
  }
  return visited;
}

function collectVisitedBlocks(
  execution: ExecutionPath,
  visited: Set<string>,
): void {
  for (const item of execution) {
    if ('parallel' in item) {
      for (const branch of item.parallel) {
        collectVisitedBlocks(branch, visited);
      }
      continue;
    }
    visited.add(item.blockId);
    collectVisitedBlocks(item.children, visited);
  }
}

function decisionArmCoverage(artifact: StoryRun): {
  readonly visited: number;
  readonly total: number;
} {
  let visited = 0;
  let total = 0;
  for (const [blockId, block] of Object.entries(artifact.blocks)) {
    if (block.kind !== 'decision') continue;
    const observed = new Set<string>();
    for (const scenario of artifact.scenarios) {
      collectSelectedArms(scenario.execution, blockId, observed);
    }
    total += block.arms.length;
    visited += block.arms.filter((arm) =>
      observed.has(selectedArmKey(arm)),
    ).length;
  }
  return { visited, total };
}

function formatPercentage(percentage: number): string {
  return `${Number(percentage.toFixed(1))}%`;
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

function reportStoryLint(
  result: StoryLintResult,
  explicit: boolean,
  verbose: boolean,
): void {
  if (result._tag === 'NoStories') {
    if (explicit) process.stdout.write('No Stories found.\n');
    return;
  }
  if (result._tag === 'Unavailable') {
    process.stderr.write(red(`Story lint unavailable: ${result.message}\n`));
    return;
  }
  reportStoryCoverage(result.report, verbose);
  if (result.report.invalidStories.length === 0 && explicit) {
    process.stdout.write(green('Story lint passed.\n'));
  }
}

function reportStoryCoverage(
  report: StoryCoverageReport,
  verbose: boolean,
): void {
  process.stdout.write('\nStory coverage\n');
  for (const story of report.stories) {
    process.stdout.write(
      `\n  ${story.name} ${paintMuted(`(${story.storyPath})`)}\n`,
    );
    process.stdout.write(
      `    Narrated ${formatPercentage(story.narrated.percentage)} · Omitted ${formatPercentage(story.omitted.percentage)} · Unnarrated ${formatPercentage(story.unnarrated.percentage)}\n`,
    );
    if (!verbose) continue;
    process.stdout.write(
      `    Lines: ${story.totalLines} non-empty ejected · ${story.narrated.lines} narrated · ${story.omitted.lines} omitted · ${story.unnarrated.lines} unnarrated\n`,
    );
    process.stdout.write(
      `    Files: ${story.files.length === 0 ? 'none' : story.files.join(', ')}\n`,
    );
    reportCoverageRanges('Functions', story.functions);
    reportCoverageRanges('Omissions', story.omissions);
    reportCoverageRanges('Unnarrated regions', story.unnarratedRegions);
  }
  if (report.invalidStories.length === 0) return;
  process.stderr.write(
    red(`\n  ${report.invalidStories.length} invalid Stories:\n`),
  );
  for (const invalid of report.invalidStories) {
    process.stderr.write(
      red(`    - ${invalid.storyPath}: ${invalid.message}\n`),
    );
  }
}

function reportCoverageRanges(
  label: string,
  ranges: readonly {
    readonly file: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly reason?: string;
  }[],
): void {
  process.stdout.write(`    ${label}:\n`);
  if (ranges.length === 0) {
    process.stdout.write('      - none\n');
    return;
  }
  for (const range of ranges) {
    const lines =
      range.startLine === range.endLine
        ? `${range.startLine}`
        : `${range.startLine}-${range.endLine}`;
    const reason = range.reason === undefined ? '' : ` — ${range.reason}`;
    process.stdout.write(`      - ${range.file}:${lines}${reason}\n`);
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
    } else if (violation.kind === 'module') {
      process.stderr.write(
        red(
          `  - [${violation.rule}] ${violation.from.module} -> ${violation.to.module}\n`,
        ),
      );
    } else {
      process.stderr.write(
        red(`  - [story-import] -> ${violation.to.module}\n`),
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

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Show Story coverage source details and line ranges.'),
);

const lintStoriesCommand = Command.make(
  'stories',
  { verbose: verboseFlag },
  ({ verbose }) => lintStories(verbose),
).pipe(
  Command.withDescription(
    'Validate Story authoring and traces, then report per-Story coverage.',
  ),
);

const lintCommand = Command.make(
  'lint',
  { verbose: verboseFlag },
  ({ verbose }) => lint(verbose),
).pipe(
  Command.withDescription(
    'Lint architecture and Stories. Coverage gaps are warnings only.',
  ),
  Command.withSubcommands([lintStoriesCommand]),
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
    'Remove Story instrumentation and delete every Module Story surface across the current project.',
  ),
);

const storiesCommand = Command.make(
  'stories',
  {
    selectors: Argument.string('selector').pipe(Argument.variadic()),
    timeout: Flag.string('timeout').pipe(
      Flag.optional,
      Flag.withDescription(
        'Default Scenario timeout for this run, e.g. "90 seconds".',
      ),
    ),
  },
  ({ selectors, timeout }) => stories(selectors, timeout),
).pipe(
  Command.withDescription(
    'Run Module paths or suffixless Story paths (all Stories by default) and print fresh execution evidence.',
  ),
  Command.withSubcommands([ejectCommand]),
);

export const command = Command.make('laymos', {}, () => Effect.void).pipe(
  Command.withSubcommands([lintCommand, storiesCommand]),
);

export const cli = command.pipe(Command.run({ version: '0.0.0' }));
