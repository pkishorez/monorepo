import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { cruiseProject } from '../cruise/index.js';
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

const lintCommand = Command.make('lint', {}, () =>
  Effect.flatMap(
    Effect.tryPromise({
      try: lint,
      catch: (err) => {
        process.stderr.write(
          `Error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return new CliExit();
      },
    }),
    (ok) => (ok ? Effect.void : Effect.fail(new CliExit())),
  ),
);

export const command = Command.make(
  'depcruise-viz',
  {},
  () => Effect.void,
).pipe(Command.withSubcommands([lintCommand]));

export const cli = Command.run(command, { version: '0.0.1' });
