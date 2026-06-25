import { existsSync } from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { assembleDepcruise, resolvePath } from './assemble.js';
import type { RunDepcruiseResult } from './types.js';

/**
 * Assemble a single self-contained DevTools report for the package at `input`.
 *
 * Cruises the package's dependency graph and emits one combined object. The
 * `depcruise` slice is a discriminated `{ available }` union, so a package
 * missing `depcruise.config.ts` still yields a valid report.
 */
export const generateReport = (input: string) =>
  Effect.gen(function* () {
    const dir = resolvePath(input);

    const depcruise: RunDepcruiseResult = existsSync(
      path.join(dir, 'depcruise.config.ts'),
    )
      ? yield* assembleDepcruise(dir)
      : { available: false as const };

    return { depcruise };
  });
