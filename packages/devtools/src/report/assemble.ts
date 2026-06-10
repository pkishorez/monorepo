import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect } from 'effect';
import {
  discoverFeatures,
  extractTests,
  loadToc,
  validate,
} from '@monorepo/vtest/analysis';
import type { Diagnostic, Feature, TestStatus } from '@monorepo/vtest/analysis';
import { cruiseProject } from 'dependency-cruiser-viz/node';
import { DevtoolsRpcError } from '../rpc/index.js';

/** Resolve an input path to an absolute path, expanding a leading `~`. */
export const resolvePath = (input: string): string =>
  path.resolve(
    input === '~' || input.startsWith('~/')
      ? path.join(homedir(), input.slice(1))
      : input,
  );

export const toError = (cause: unknown): DevtoolsRpcError =>
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

/** Build the fast docs payload (markdown, toc, pending test rows) for `dir`. */
export const assembleVtestDocs = (dir: string) =>
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

interface TestRunRecord {
  readonly feature: string;
  readonly groupId: string;
  readonly name: string;
  readonly status: TestStatus;
  readonly durationMs?: number;
  readonly error?: string;
}

interface VtestRunModule {
  readonly runPackageOnce: (packageDir: string) => unknown;
}

interface EffectModule {
  readonly Effect: {
    readonly runPromise: <A>(effect: unknown) => Promise<A>;
  };
}

const importFromPackage = async <T>(
  dir: string,
  specifier: string,
): Promise<T> => {
  const requireFromPackage = createRequire(path.join(dir, 'package.json'));
  const resolved = requireFromPackage.resolve(specifier);
  return import(pathToFileURL(resolved).href) as Promise<T>;
};

const runPackageOnceFromPackage = (
  dir: string,
): Effect.Effect<ReadonlyArray<TestRunRecord>, DevtoolsRpcError> =>
  Effect.tryPromise({
    try: async () => {
      // The runner must come from the target package so Vitest's runtime and
      // the package's `@monorepo/vtest` authoring helpers share one instance.
      const [vtestRun, targetEffect] = await Promise.all([
        importFromPackage<VtestRunModule>(dir, '@monorepo/vtest/run'),
        importFromPackage<EffectModule>(dir, 'effect'),
      ]);

      if (typeof vtestRun.runPackageOnce !== 'function') {
        throw new Error(`@monorepo/vtest/run did not export runPackageOnce`);
      }
      if (typeof targetEffect.Effect?.runPromise !== 'function') {
        throw new Error(`effect did not export Effect.runPromise`);
      }

      return targetEffect.Effect.runPromise<ReadonlyArray<TestRunRecord>>(
        vtestRun.runPackageOnce(dir),
      );
    },
    catch: toError,
  });

/** Run the package's documented suite and return flat per-test records. */
export const assembleVtestRun = (dir: string) =>
  Effect.map(runPackageOnceFromPackage(dir), (records) => ({
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

/** Cruise the package and return the visualization data payload. */
export const assembleDepcruise = (dir: string) =>
  Effect.map(
    Effect.tryPromise({ try: () => cruiseProject(dir), catch: toError }),
    (result) => ({
      available: true as const,
      data: { config: result.config, summary: result.summary },
    }),
  );
