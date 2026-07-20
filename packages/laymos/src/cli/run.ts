import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { analyzeProject } from '../node.js';
import type { LaymosReport, Violation } from '../report/index.js';

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
      warning.kind === 'missing-layer-path'
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

export const command = Command.make('laymos', {}, () => Effect.void).pipe(
  Command.withSubcommands([lintCommand]),
);

export const cli = Command.run(command, { version: '0.0.0' });
