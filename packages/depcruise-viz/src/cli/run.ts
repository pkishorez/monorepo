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

  process.stdout.write(lines.join('\n') + '\n');
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
  const { violations, breaches } = output.summary;

  reportCoverage(output.summary);

  if (violations.length === 0 && breaches.length === 0) {
    process.stdout.write(green('No violations or boundary breaches found.\n'));
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

  if (breaches.length > 0) {
    process.stderr.write(
      red(`Found ${breaches.length} boundary breach(es):`) + '\n\n',
    );
    for (const b of breaches) {
      process.stderr.write(red(`  ${b.reason}`) + '\n');
      process.stderr.write(
        red(
          `    ${b.fromModule} (${b.fromFeature ?? 'infra'}) -> ${b.toModule} (${b.toFeature ?? 'infra'}, ${b.toVisibility})`,
        ) + '\n',
      );
      process.stderr.write(red(`    ${b.fromFile} -> ${b.toFile}`) + '\n\n');
    }
  }

  process.stderr.write(
    red(
      `Lint failed: ${violations.length} violation(s), ${breaches.length} breach(es).`,
    ) + '\n',
  );

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
