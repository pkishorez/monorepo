import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { cruiseProject } from '../cruise/index.js';

/**
 * Runs the lint logic. Resolves `true` when there are no violations or
 * boundary breaches, and `false` when any are found (after printing them to
 * stderr), so the caller can set the process exit code accordingly.
 */
async function lint(): Promise<boolean> {
  const output = await cruiseProject(process.cwd());
  const { violations, breaches } = output.summary;

  if (violations.length === 0 && breaches.length === 0) {
    process.stdout.write('No violations or boundary breaches found.\n');
    return true;
  }

  if (violations.length > 0) {
    process.stderr.write(`Found ${violations.length} layer violation(s):\n\n`);
    for (const v of violations) {
      process.stderr.write(`  ${v.severity} ${v.rule}\n`);
      process.stderr.write(`    ${v.from} -> ${v.to}\n`);
      process.stderr.write(`    ${v.fromFile} -> ${v.toFile}\n\n`);
    }
  }

  if (breaches.length > 0) {
    process.stderr.write(`Found ${breaches.length} boundary breach(es):\n\n`);
    for (const b of breaches) {
      process.stderr.write(`  ${b.reason}\n`);
      process.stderr.write(
        `    ${b.fromModule} (${b.fromFeature ?? 'infra'}) -> ${b.toModule} (${b.toFeature ?? 'infra'}, ${b.toVisibility})\n`,
      );
      process.stderr.write(`    ${b.fromFile} -> ${b.toFile}\n\n`);
    }
  }

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
