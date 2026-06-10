import { existsSync } from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import {
  assembleDepcruise,
  assembleVtestDocs,
  assembleVtestRun,
  resolvePath,
  toError,
} from './assemble.js';
import { mergeRunRecords } from './merge.js';
import type { RunDepcruiseResult, VtestReport } from './types.js';

/**
 * Assemble a single self-contained DevTools report for the package at `input`.
 *
 * Unlike the RPC server (which splits fast docs from a slow run and merges them
 * in the browser), this runs the package's vtest suite and bakes the resolved
 * statuses into the `vtest` slice, then cruises its dependency graph — emitting
 * one combined object. Each slice is a discriminated `{ available }` union, so a
 * package missing `vtest/` or `depcruise.config.ts` still yields a valid report.
 */
export const generateReport = (input: string) =>
  Effect.gen(function* () {
    const dir = resolvePath(input);

    const vtest: VtestReport = existsSync(path.join(dir, 'vtest'))
      ? yield* Effect.map(
          Effect.all([assembleVtestDocs(dir), assembleVtestRun(dir)]).pipe(
            Effect.mapError(toError),
          ),
          ([docs, run]) => mergeRunRecords(docs, run.records),
        )
      : { available: false as const };

    const depcruise: RunDepcruiseResult = existsSync(
      path.join(dir, 'depcruise.config.ts'),
    )
      ? yield* assembleDepcruise(dir)
      : { available: false as const };

    return { vtest, depcruise };
  });
