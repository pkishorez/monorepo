import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import {
  discoverFeatures,
  extractTests,
  loadToc,
  validate,
} from '@monorepo/vtest/analysis';
import type { Diagnostic, Feature, TestStatus } from '@monorepo/vtest/analysis';
import { runPackageOnce } from '@monorepo/vtest/run';
import { cruiseProject } from 'dependency-cruiser-viz';
import { DevtoolsRpc, DevtoolsRpcError } from '../rpc/index.js';

/** Resolve an input path to an absolute path, expanding a leading `~`. */
const resolvePath = (input: string): string =>
  path.resolve(
    input === '~' || input.startsWith('~/')
      ? path.join(homedir(), input.slice(1))
      : input,
  );

const toError = (cause: unknown): DevtoolsRpcError =>
  cause instanceof DevtoolsRpcError
    ? cause
    : new DevtoolsRpcError({ message: String(cause) });

const assembleGroup = (group: Feature['groups'][number]) =>
  Effect.gen(function* () {
    const files = yield* Effect.forEach(group.testFiles, (fileName) => {
      const filePath = path.join(group.dir, fileName);
      return Effect.map(
        Effect.tryPromise({
          try: () => readFile(filePath, 'utf8'),
          catch: toError,
        }),
        (source) => ({ path: filePath, source }),
      );
    });

    const tests = files.flatMap((file) =>
      extractTests(file.source).map((test) => ({
        name: test.name,
        vdoc: test.vdoc,
        status: 'pending' as TestStatus,
        file: file.path,
        startLine: test.startLine,
        endLine: test.endLine,
      })),
    );

    return { id: group.id, files, tests };
  });

const assembleVtestDocs = (dir: string) =>
  Effect.gen(function* () {
    const [features, toc, diagnostics] = yield* Effect.all([
      discoverFeatures(dir),
      loadToc(dir),
      validate(dir),
    ]);

    const diagnosticsByFeature = new Map<string, Array<Diagnostic>>();
    for (const diagnostic of diagnostics) {
      if (diagnostic.feature === undefined) continue;
      const list = diagnosticsByFeature.get(diagnostic.feature) ?? [];
      list.push(diagnostic);
      diagnosticsByFeature.set(diagnostic.feature, list);
    }

    const assembledFeatures = yield* Effect.forEach(features, (feature) =>
      Effect.map(
        Effect.forEach(feature.groups, (group) => assembleGroup(group)),
        (groups) => ({
          name: feature.name,
          markdown: feature.doc,
          directives: feature.directives,
          diagnostics: diagnosticsByFeature.get(feature.name) ?? [],
          groups,
        }),
      ),
    );

    return {
      available: true as const,
      package: { name: path.basename(dir), dir },
      toc: { sections: toc.sections },
      features: assembledFeatures,
    };
  });

const assembleVtestRun = (dir: string) =>
  Effect.map(runPackageOnce(dir), (records) => ({
    available: true as const,
    records: records.map((record) => ({
      feature: record.feature,
      groupId: record.groupId,
      name: record.name,
      status: record.status,
      ...(record.durationMs !== undefined
        ? { durationMs: record.durationMs }
        : {}),
      ...(record.error !== undefined ? { error: record.error } : {}),
    })),
  }));

/** Live handlers for the {@link DevtoolsRpc} group. */
export const DevtoolsHandlersLive = DevtoolsRpc.toLayer({
  RunVtestDocs: ({ path: input }) =>
    Effect.gen(function* () {
      const dir = resolvePath(input);
      if (!existsSync(path.join(dir, 'vtest'))) {
        return { available: false as const };
      }
      return yield* assembleVtestDocs(dir).pipe(Effect.mapError(toError));
    }),
  RunVtestRun: ({ path: input }) =>
    Effect.gen(function* () {
      const dir = resolvePath(input);
      if (!existsSync(path.join(dir, 'vtest'))) {
        return { available: false as const };
      }
      return yield* assembleVtestRun(dir).pipe(Effect.mapError(toError));
    }),
  RunDepcruise: ({ path: input }) =>
    Effect.gen(function* () {
      const dir = resolvePath(input);
      if (!existsSync(path.join(dir, 'depcruise.config.ts'))) {
        return { available: false as const };
      }
      const result = yield* Effect.tryPromise({
        try: () => cruiseProject(dir),
        catch: toError,
      });
      return {
        available: true as const,
        data: { config: result.config, summary: result.summary },
      };
    }),
});
