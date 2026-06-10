#!/usr/bin/env -S npx tsx
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Effect } from 'effect';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { generateReport } from '../report/generate.js';

/**
 * Generate a DevTools report for the current working directory and write it as
 * JSON. Usage: `devtools-report [outFile]` (defaults to
 * `<cwd>/devtools.report.json`).
 */
const program = Effect.gen(function* () {
  const cwd = process.cwd();
  const outPath = path.resolve(
    process.argv[2] ?? path.join(cwd, 'devtools.report.json'),
  );

  const report = yield* generateReport(cwd);

  yield* Effect.tryPromise(() =>
    writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`),
  );
  yield* Effect.log(`wrote devtools report → ${outPath}`);
}).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);
