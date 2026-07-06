import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { cruise } from 'dependency-cruiser';
import type { ICruiseOptions, ICruiseResult } from 'dependency-cruiser';

import { summarizeCruiseResult } from '../analyze/index.js';
import {
  toDependencyCruiserConfig,
  toVisualizationConfig,
} from '../compile/index.js';
import { loadConfig } from '../cli/load-config.js';
import type { DepcruiseVizResult } from '../types.js';

/** Coarse progress phases emitted while {@link cruiseProject} runs. */
export type DepcruisePhase =
  | 'load-config'
  | 'compile-config'
  | 'cruise'
  | 'summarize';

/**
 * Cruises the package rooted at `baseDir`. Loads the project's
 * `depcruise.config.ts` from `<baseDir>/depcruise.config.ts` and resolves the
 * project's `rootDir` and `tsconfig.json` relative to `baseDir` (never the
 * current working directory), so it works against an arbitrary package path.
 * `onPhase` is invoked right before each phase starts.
 */
export async function cruiseProject(
  baseDir: string,
  onPhase?: (phase: DepcruisePhase) => void,
): Promise<DepcruiseVizResult> {
  onPhase?.('load-config');
  const projectConfig = await loadConfig(
    resolve(baseDir, 'depcruise.config.ts'),
  );
  onPhase?.('compile-config');
  const dependencyCruiserConfig = toDependencyCruiserConfig(
    projectConfig.rules,
  );
  const config = toVisualizationConfig(projectConfig);

  const cruiseOptions: ICruiseOptions = {
    ruleSet: dependencyCruiserConfig,
    tsPreCompilationDeps: 'specify',
    validate: true,
    // Relativize module sources to the cruised package, not the host process's
    // cwd, so paths line up with the config's `rootDir`-relative layer/module
    // patterns when cruising an arbitrary package path (e.g. from DevTools).
    baseDir,
  };

  const tsConfigPath = resolve(baseDir, 'tsconfig.json');
  if (existsSync(tsConfigPath)) {
    cruiseOptions.tsConfig = { fileName: tsConfigPath };
  }

  // `baseDir` resolves both the input globs and the emitted module sources, so
  // pass `rootDir` relative to it (not an absolute path, which would double-join).
  //
  // dependency-cruiser's module RESOLVER still keys off the real process cwd
  // (the `baseDir` option only relativizes reported paths), so resolving from a
  // host process whose cwd is not the cruised package — e.g. the DevTools server
  // — makes most imports fail to resolve and silently drops their edges. chdir
  // into the package for the duration of the cruise (restored in `finally`) and
  // bust the resolver cache so it re-initialises against this cwd.
  const previousCwd = process.cwd();
  let result: Awaited<ReturnType<typeof cruise>>;
  try {
    onPhase?.('cruise');
    process.chdir(baseDir);
    result = await cruise([projectConfig.rootDir], cruiseOptions, {
      bustTheCache: true,
    });
  } finally {
    process.chdir(previousCwd);
  }

  const cruiseResult = result.output as ICruiseResult;
  onPhase?.('summarize');
  const summary = summarizeCruiseResult(cruiseResult, config);

  return {
    dependencyCruiserConfig,
    cruiseResult,
    config,
    summary,
  } satisfies DepcruiseVizResult;
}
