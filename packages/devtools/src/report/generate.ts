import { existsSync } from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { assembleDepcruise, assembleLaymos, resolvePath } from './assemble.js';
import type { RunDepcruiseResult, RunLaymosResult } from './types.js';

/**
 * Assemble a single self-contained DevTools report for the package at `input`.
 *
 * Analyzes the package's dependency graph and emits one combined object. Each
 * analyzer slice is a discriminated `{ available }` union, so a package
 * missing either config still yields a valid report.
 */
export const generateReport = (input: string) =>
  Effect.gen(function* () {
    const dir = resolvePath(input);

    const depcruise: RunDepcruiseResult = existsSync(
      path.join(dir, 'depcruise.config.ts'),
    )
      ? yield* assembleDepcruise(dir)
      : { available: false as const };

    const laymos: RunLaymosResult = existsSync(
      path.join(dir, 'laymos.config.ts'),
    )
      ? yield* assembleLaymos(dir)
      : { available: false as const };

    return { depcruise, laymos };
  });
