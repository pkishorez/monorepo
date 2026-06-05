import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';

import { cruise } from 'dependency-cruiser';
import type { ICruiseOptions, ICruiseResult } from 'dependency-cruiser';
import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { summarizeCruiseResult } from '../analyze/index.js';
import {
  toDependencyCruiserConfig,
  toVisualizationConfig,
} from '../compile/index.js';
import type { DepcruiseVizData, DepcruiseVizResult } from '../types.js';

import { loadConfig } from './load-config.js';

const CONFIG_PATH = resolve('depcruise.config.ts');

async function cruiseProject(): Promise<DepcruiseVizResult> {
  const projectConfig = await loadConfig(CONFIG_PATH);
  const dependencyCruiserConfig = toDependencyCruiserConfig(
    projectConfig.rules,
  );
  const config = toVisualizationConfig(projectConfig);
  const cruiseOptions: ICruiseOptions = {
    ruleSet: dependencyCruiserConfig,
    tsPreCompilationDeps: 'specify',
    validate: true,
  };
  if (existsSync('tsconfig.json')) {
    cruiseOptions.tsConfig = { fileName: 'tsconfig.json' };
  }

  const result = await cruise([projectConfig.rootDir], cruiseOptions);

  const cruiseResult = result.output as ICruiseResult;
  const summary = summarizeCruiseResult(cruiseResult, config);

  return {
    dependencyCruiserConfig,
    config,
    summary,
  } satisfies DepcruiseVizResult;
}

async function viz(): Promise<void> {
  const output = await cruiseProject();

  const vizData: DepcruiseVizData = {
    config: output.config,
    summary: output.summary,
  };
  const hash = encodeURIComponent(JSON.stringify(vizData));
  const url = `http://localhost:20001/dep-cruiser#${hash}`;

  const openCmd =
    platform() === 'darwin'
      ? 'open'
      : platform() === 'win32'
        ? 'start'
        : 'xdg-open';

  exec(`${openCmd} '${url}'`);
  process.stdout.write(`${url}\n`);
}

/**
 * Runs the lint logic. Resolves `true` when there are no violations or
 * boundary breaches, and `false` when any are found (after printing them to
 * stderr), so the caller can set the process exit code accordingly.
 */
async function lint(): Promise<boolean> {
  const output = await cruiseProject();
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

const runEffect = (effect: () => Promise<void>): Effect.Effect<void, CliExit> =>
  Effect.tryPromise({
    try: effect,
    catch: (err) => {
      process.stderr.write(
        `Error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return new CliExit();
    },
  });

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

export const command = Command.make('depcruise-viz', {}, () =>
  runEffect(viz),
).pipe(Command.withSubcommands([lintCommand]));

export const cli = Command.run(command, { version: '0.0.1' });
