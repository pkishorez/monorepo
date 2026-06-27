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

/**
 * Cruises the package rooted at `baseDir`. Loads the project's
 * `depcruise.config.ts` from `<baseDir>/depcruise.config.ts` and resolves the
 * project's `rootDir` and `tsconfig.json` relative to `baseDir` (never the
 * current working directory), so it works against an arbitrary package path.
 */
export async function cruiseProject(
  baseDir: string,
): Promise<DepcruiseVizResult> {
  const projectConfig = await loadConfig(
    resolve(baseDir, 'depcruise.config.ts'),
  );
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
  const result = await cruise([projectConfig.rootDir], cruiseOptions);

  const cruiseResult = result.output as ICruiseResult;
  const summary = summarizeCruiseResult(cruiseResult, config);

  return {
    dependencyCruiserConfig,
    config,
    summary,
  } satisfies DepcruiseVizResult;
}
