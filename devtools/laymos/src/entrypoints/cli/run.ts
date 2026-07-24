import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { analyzeProject, runTests } from '../node/index.js';
import type { LaymosReport, Violation } from '../../report/index.js';
import { renderTestsReport, selectedTestCases } from './test-output.js';

const paint =
  (stream: NodeJS.WriteStream, code: string, color: boolean) =>
  (text: string): string =>
    color && stream.isTTY && process.env['NO_COLOR'] === undefined
      ? `\x1b[${code}m${text}\x1b[0m`
      : text;

export function lintPasses(report: Pick<LaymosReport, 'violations'>): boolean {
  return report.violations.length === 0;
}

function lint(
  color: boolean,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> {
  const green = paint(process.stdout, '32', color);
  const yellow = paint(process.stdout, '33', color);
  const red = paint(process.stderr, '31', color);
  return analyzeProject({ projectDir: process.cwd() }).pipe(
    Effect.flatMap((report) =>
      Effect.suspend(() => {
        reportCoverage(report, yellow);
        reportWarnings(report, yellow);
        if (lintPasses(report)) {
          process.stdout.write(green('No violations found.\n'));
          return Effect.void;
        }
        reportViolations(report.violations, red);
        return markFailure();
      }),
    ),
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(red(`Error: ${errorMessage(error)}\n`));
        process.exitCode = 1;
      }),
    ),
  );
}

function reportCoverage(
  report: LaymosReport,
  yellow: (text: string) => string,
): void {
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
      yellow,
    );
  }
  for (const coverage of report.coverage.modules) {
    if (coverage.uncovered.length > 0) {
      writeWarningList(
        `file(s) in layer "${coverage.layer}" not covered by a module`,
        coverage.uncovered,
        yellow,
      );
    }
  }
}

function reportWarnings(
  report: LaymosReport,
  yellow: (text: string) => string,
): void {
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

function writeWarningList(
  title: string,
  files: readonly string[],
  yellow: (text: string) => string,
): void {
  process.stdout.write(yellow(`warning: ${files.length} ${title}:\n`));
  for (const file of files) process.stdout.write(yellow(`  - ${file}\n`));
}

function reportViolations(
  violations: readonly Violation[],
  red: (text: string) => string,
): void {
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
    }
    process.stderr.write(
      red(`    ${violation.from.file} -> ${violation.to.file}\n`),
    );
  }
  process.stderr.write(
    red(`Lint failed: ${violations.length} violation(s).\n`),
  );
}

const ErrorMessageSchema = Schema.Struct({ message: Schema.String });

function errorMessage(error: unknown): string {
  const decoded = Schema.decodeUnknownOption(ErrorMessageSchema)(error);
  return Option.isSome(decoded) ? decoded.value.message : String(error);
}

const colorFlag = Flag.boolean('color').pipe(
  Flag.withDefault(true),
  Flag.withDescription('Enable terminal colors; use --no-color to disable.'),
);

const rootCommand = Command.make('laymos', {}, () => Effect.void).pipe(
  Command.withSharedFlags({ color: colorFlag }),
);

const lintCommand = Command.make('lint', {}, () =>
  Effect.gen(function* () {
    const { color } = yield* rootCommand;
    yield* lint(color);
  }),
).pipe(Command.withDescription('Lint the declared project architecture.'));

const targetArgument = Argument.string('target').pipe(
  Argument.withDescription('Existing test file or literal test-name query.'),
  Argument.optional,
);

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Expand all evidence, trace attributes, events, and logs.',
  ),
);

const testCommand = Command.make(
  'test',
  { target: targetArgument, verbose: verboseFlag },
  ({ target, verbose }) =>
    Effect.gen(function* () {
      const { color } = yield* rootCommand;
      yield* test(Option.getOrUndefined(target), verbose, color);
    }),
).pipe(
  Command.withDescription(
    'Run Vitest and present cases, assertions, traces, and timing.',
  ),
);

export const command = rootCommand.pipe(
  Command.withSubcommands([lintCommand, testCommand]),
);

export const cli = command.pipe(Command.run({ version: '0.0.1' }));

function test(
  target: string | undefined,
  verbose: boolean,
  color: boolean,
): Effect.Effect<void> {
  const selection = resolveTestSelection(target);
  const red = paint(process.stderr, '31', color);
  return runTests({
    projectDir: process.cwd(),
    ...(selection?.kind === 'file' ? { files: [selection.path] } : {}),
    ...(selection?.kind === 'name'
      ? { testNamePattern: literalNamePattern(selection.query) }
      : {}),
  }).pipe(
    Effect.flatMap((report) =>
      Effect.suspend(() => {
        const nameQuery =
          selection?.kind === 'name' ? selection.query : undefined;
        const selected = selectedTestCases(report, nameQuery);
        const reportOptions = {
          color:
            color &&
            process.stdout.isTTY === true &&
            process.env['NO_COLOR'] === undefined,
          detailed: target !== undefined || verbose,
          ...(nameQuery === undefined ? {} : { nameQuery }),
          verbose,
        };
        if (selected.length === 0) {
          if (report.status === 'failed') {
            process.stdout.write(renderTestsReport(report, reportOptions));
          }
          const message =
            nameQuery === undefined
              ? 'No tests found.'
              : `No tests matched "${nameQuery}".`;
          process.stderr.write(red(`${message}\n`));
          return markFailure();
        }

        process.stdout.write(renderTestsReport(report, reportOptions));
        return report.status === 'failed' ? markFailure() : Effect.void;
      }),
    ),
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(red(`Error: ${errorMessage(error)}\n`));
        process.exitCode = 1;
      }),
    ),
  );
}

function markFailure(): Effect.Effect<void> {
  return Effect.sync(() => {
    process.exitCode = 1;
  });
}

type TestSelection =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'name'; readonly query: string };

function resolveTestSelection(
  target: string | undefined,
): TestSelection | undefined {
  if (target === undefined) return undefined;
  const path = resolve(process.cwd(), target);
  try {
    if (statSync(path).isFile()) return { kind: 'file', path };
  } catch {
    return { kind: 'name', query: target };
  }
  return { kind: 'name', query: target };
}

function literalNamePattern(query: string): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}
