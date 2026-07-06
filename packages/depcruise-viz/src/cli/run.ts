import { Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { cruiseProject } from '../cruise/index.js';
import { analyzeDeps, analyzeFiles } from '../node.js';
import type {
  DepsAnalysis,
  FilesAnalysis,
  FileDependencyGroup,
} from '../node.js';
import type { VizSummary } from '../types.js';

const paint =
  (stream: NodeJS.WriteStream, code: string) =>
  (text: string): string =>
    stream.isTTY && process.env['NO_COLOR'] === undefined
      ? `\x1b[${code}m${text}\x1b[0m`
      : text;

const yellow = paint(process.stdout, '33');
const green = paint(process.stdout, '32');
const red = paint(process.stderr, '31');
const EDGE_LIST_LIMIT = 10;

/**
 * Prints the layer/module coverage status to stdout: how many files were
 * scanned, how many each of the declared layers and modules cover, and a
 * yellow warning listing every file that no layer (or no module) accounts
 * for. Warnings never fail the lint — only violations and breaches do.
 */
function reportCoverage(summary: VizSummary): void {
  const layerCovered = summary.coveredFiles.reduce(
    (n, l) => n + l.files.length,
    0,
  );
  const total = layerCovered + summary.layerOrphanFiles.length;
  const moduleCovered = summary.moduleCoverage.reduce(
    (n, m) => n + m.files.length,
    0,
  );

  const lines: string[] = [];
  const ignored =
    summary.ignoredFiles.length > 0
      ? ` (${summary.ignoredFiles.length} ignored)`
      : '';
  lines.push(`Scanned ${total} file(s)${ignored}.`);

  lines.push(
    `Layers: ${summary.coveredFiles.length} layer(s) cover ${layerCovered}/${total} file(s).`,
  );
  if (summary.layerOrphanFiles.length > 0) {
    lines.push(
      yellow(
        `  warning: ${summary.layerOrphanFiles.length} file(s) not covered by any layer:`,
      ),
    );
    for (const file of summary.layerOrphanFiles) {
      lines.push(yellow(`    - ${file}`));
    }
  }

  lines.push(
    `Modules: ${summary.moduleCoverage.length} module(s) cover ${moduleCovered}/${layerCovered} layer-covered file(s).`,
  );
  if (summary.coverageGaps.length > 0) {
    lines.push(
      yellow(
        `  warning: ${summary.coverageGaps.length} file(s) not covered by any module:`,
      ),
    );
    for (const file of summary.coverageGaps) {
      lines.push(yellow(`    - ${file}`));
    }
  }

  if (summary.emptyModules.length > 0) {
    lines.push(
      yellow(
        `  warning: ${summary.emptyModules.length} declared module(s) own no files (redundant — files belong to a nested module):`,
      ),
    );
    for (const m of summary.emptyModules) {
      lines.push(yellow(`    - ${m.path} (${m.layer})`));
    }
  }

  if (summary.conflicts.length > 0) {
    lines.push(
      yellow(
        `  warning: ${summary.conflicts.length} overlapping layer pattern(s) — files matching both are attributed to the first-declared layer:`,
      ),
    );
    for (const c of summary.conflicts) {
      lines.push(
        yellow(
          `    - ${c.layerA} (${c.pathA}) overlaps ${c.layerB} (${c.pathB})`,
        ),
      );
    }
  }

  if (summary.moduleViolations.length > 0) {
    lines.push(
      red(
        `  violation: ${summary.moduleViolations.length} module rule breach(es):`,
      ),
    );
    for (const v of summary.moduleViolations) {
      lines.push(
        red(`    - [${v.rule}] ${v.module}: ${v.fromFile} -> ${v.toFile}`),
      );
    }
  }

  if (summary.moduleOverlaps.length > 0) {
    lines.push(
      red(
        `  violation: ${summary.moduleOverlaps.length} overlapping module declaration(s) — modules must be exhaustive and mutually exclusive, no nesting:`,
      ),
    );
    for (const o of summary.moduleOverlaps) {
      lines.push(red(`    - ${o.innerPath} nests inside ${o.outerPath}`));
    }
  }

  process.stdout.write(lines.join('\n') + '\n');
}

function reportDeps(analysis: DepsAnalysis): void {
  const lines: string[] = [];
  lines.push(`deps: ${analysis.targetPath}`);
  lines.push('');
  appendEdgeGroups(lines, 'incoming', analysis.incoming);
  lines.push('');
  appendEdgeGroups(lines, 'outgoing', analysis.outgoing);
  lines.push('');
  lines.push('insights:');
  lines.push(`  entry-point/barrel: ${formatEntryPoint(analysis)}`);
  if (analysis.insights.entryPoint.offenders.length > 0) {
    lines.push('    deep-imported files:');
    for (const file of analysis.insights.entryPoint.offenders) {
      lines.push(yellow(`      - ${file}`));
    }
  }
  lines.push('  suggested module rules:');
  lines.push(
    `    onlyImportedBy: ${JSON.stringify(analysis.insights.suggestedRules.onlyImportedBy ?? [])}`,
  );
  if (analysis.insights.suggestedRules.leaf) {
    lines.push('    leaf: true');
  } else {
    lines.push(
      `    onlyImports: ${JSON.stringify(analysis.insights.suggestedRules.onlyImports ?? [])}`,
    );
  }
  lines.push(`  config: ${formatConfigCrossReference(analysis)}`);

  process.stdout.write(lines.join('\n') + '\n');
}

function appendEdgeGroups(
  lines: string[],
  title: string,
  groups: FileDependencyGroup[],
): void {
  lines.push(`${title}:`);
  if (groups.length === 0) {
    lines.push('  none');
    return;
  }

  for (const group of groups) {
    lines.push(`  ${group.counterpart} (${group.count})`);
    for (const edge of group.edges.slice(0, EDGE_LIST_LIMIT)) {
      lines.push(`    - ${edge.fromFile} -> ${edge.toFile}`);
    }
    const more = group.edges.length - EDGE_LIST_LIMIT;
    if (more > 0) {
      lines.push(`    +${more} more`);
    }
  }
}

function formatEntryPoint(analysis: DepsAnalysis): string {
  const entryPoint = analysis.insights.entryPoint;
  if (entryPoint.verdict === 'no-incoming') {
    return 'no incoming edges';
  }
  if (entryPoint.verdict === 'single-index') {
    return `all incoming edges route through ${entryPoint.entryFile}`;
  }
  return yellow(
    'deep imports detected; incoming edges do not route through a single index file',
  );
}

function formatConfigCrossReference(analysis: DepsAnalysis): string {
  const declared = analysis.insights.config.declaredModule;
  const moduleText = declared
    ? `declared module ${declared.path} (${declared.name})`
    : 'not a declared module';
  const layerText = analysis.insights.config.layer
    ? `covered by layer ${analysis.insights.config.layer}`
    : 'not covered by any layer';
  return `${moduleText}; ${layerText}`;
}

function reportFiles(analysis: FilesAnalysis, options: { all: boolean }): void {
  const lines: string[] = [];
  const { stats } = analysis;
  lines.push(
    [
      `total ${stats.totalFiles}`,
      `layer-covered ${stats.layerCoveredFiles}`,
      `module-covered ${stats.moduleCoveredFiles}`,
      `orphaned ${stats.orphanedFiles}`,
      `covered-by-layer-but-no-module ${stats.coveredByLayerButNoModuleFiles}`,
      `ignored ${stats.ignoredFiles}`,
    ].join(' / '),
  );
  lines.push('');

  appendFileList(lines, 'orphaned (no layer)', analysis.problems.orphaned);
  appendFileList(
    lines,
    'module gaps (covered by layer, no module)',
    analysis.problems.moduleGaps,
  );
  appendFileList(lines, 'ignored', analysis.problems.ignored);

  if (
    analysis.problems.orphaned.length === 0 &&
    analysis.problems.moduleGaps.length === 0 &&
    analysis.problems.ignored.length === 0
  ) {
    lines.push(green('No inventory problem groups found.'));
  }

  if (options.all) {
    lines.push('');
    lines.push('covered:');
    for (const layer of analysis.covered) {
      lines.push(`  ${layer.layer} (${layer.files.length})`);
      for (const module of layer.modules) {
        lines.push(`    ${module.module} (${module.files.length})`);
        for (const file of module.files) {
          lines.push(`      - ${file}`);
        }
      }
      if (layer.filesWithoutModule.length > 0) {
        lines.push(`    no module (${layer.filesWithoutModule.length})`);
        for (const file of layer.filesWithoutModule) {
          lines.push(`      - ${file}`);
        }
      }
    }
  }

  process.stdout.write(lines.join('\n') + '\n');
}

function appendFileList(lines: string[], title: string, files: string[]): void {
  if (files.length === 0) return;
  lines.push(`${title}:`);
  for (const file of files) {
    lines.push(yellow(`  - ${file}`));
  }
  lines.push('');
}

/**
 * Pure pass/fail predicate over a `VizSummary`. Returns `true` iff there are
 * no layer violations, no overlapping module declarations, and no module
 * rule breaches — identical to
 * what `lint()` uses to set the exit code, but side-effect-free for unit
 * testing.
 */
export function lintPasses(summary: {
  violations: VizSummary['violations'];
  moduleOverlaps: VizSummary['moduleOverlaps'];
  moduleViolations: VizSummary['moduleViolations'];
}): boolean {
  return (
    summary.violations.length === 0 &&
    summary.moduleOverlaps.length === 0 &&
    summary.moduleViolations.length === 0
  );
}

/**
 * Runs the lint logic. Resolves `true` when there are no violations or
 * boundary breaches, and `false` when any are found (after printing them to
 * stderr), so the caller can set the process exit code accordingly. Coverage
 * gaps (files outside every layer or module) are reported as warnings and do
 * not affect the result.
 */
async function lint(): Promise<boolean> {
  const output = await cruiseProject(process.cwd());
  const { violations } = output.summary;

  reportCoverage(output.summary);

  if (lintPasses(output.summary)) {
    process.stdout.write(green('No violations found.\n'));
    return true;
  }

  if (violations.length > 0) {
    process.stderr.write(
      red(`Found ${violations.length} layer violation(s):`) + '\n\n',
    );
    for (const v of violations) {
      process.stderr.write(red(`  ${v.severity} ${v.rule}`) + '\n');
      process.stderr.write(red(`    ${v.from} -> ${v.to}`) + '\n');
      process.stderr.write(red(`    ${v.fromFile} -> ${v.toFile}`) + '\n\n');
    }
  }

  const failCount =
    violations.length +
    output.summary.moduleOverlaps.length +
    output.summary.moduleViolations.length;
  process.stderr.write(red(`Lint failed: ${failCount} violation(s).`) + '\n');

  return false;
}

/**
 * Marker failure used to set a non-zero exit code without emitting any extra
 * diagnostic output (the human-readable message has already been written to
 * the relevant stream).
 */
class CliExit {
  readonly _tag = 'CliExit';
}

function cliExitOnError(err: unknown): CliExit {
  process.stderr.write(
    `Error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  return new CliExit();
}

const lintCommand = Command.make('lint', {}, () =>
  Effect.flatMap(
    Effect.tryPromise({ try: lint, catch: cliExitOnError }),
    (ok) => (ok ? Effect.void : Effect.fail(new CliExit())),
  ),
);

const depsPath = Argument.string('path');

const depsCommand = Command.make('deps', { path: depsPath }, ({ path }) =>
  Effect.tryPromise({
    try: async () => {
      reportDeps(await analyzeDeps(process.cwd(), path));
    },
    catch: cliExitOnError,
  }),
);

const all = Flag.boolean('all').pipe(Flag.withDefault(false));

const filesCommand = Command.make('files', { all }, ({ all }) =>
  Effect.tryPromise({
    try: async () => {
      reportFiles(await analyzeFiles(process.cwd()), { all });
    },
    catch: cliExitOnError,
  }),
);

export const command = Command.make(
  'depcruise-viz',
  {},
  () => Effect.void,
).pipe(Command.withSubcommands([lintCommand, depsCommand, filesCommand]));

export const cli = Command.run(command, { version: '0.0.1' });
