import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { inspectFile, inspectModule } from '../index.js';

function moduleScenario(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/modules/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

function layerScenario(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/layers/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

describe('inspectFile', () => {
  test('describes file membership, role, and dependencies', async () => {
    const inspection = await inspectFile(
      moduleScenario('valid'),
      'src/feature/index.ts',
    ).pipe(Effect.runPromise);

    expect(inspection).toEqual({
      path: 'src/feature/index.ts',
      layer: 'app',
      module: 'src/feature',
      role: 'public-entry-point',
      dependencies: [
        { path: 'src/shared/index.ts', kind: 'direct' },
        { path: 'src/shared/public/index.ts', kind: 'direct' },
      ],
      recursive: false,
      hasCoverageViolation: false,
    });
  });

  test('keeps an unassigned included file inspectable', async () => {
    const inspection = await inspectFile(
      layerScenario('unassigned-file'),
      'src/shared/log.ts',
    ).pipe(Effect.runPromise);

    expect(inspection.layer).toBeUndefined();
    expect(inspection.module).toBeUndefined();
    expect(inspection.role).toBeUndefined();
    expect(inspection.hasCoverageViolation).toBe(true);
  });

  test('rejects a folder and an ignored file', async () => {
    const folderError = await inspectFile(
      moduleScenario('valid'),
      'src/feature',
    ).pipe(Effect.flip, Effect.runPromise);
    const ignoredError = await inspectFile(
      moduleScenario('valid'),
      'src/shared/generated.ts',
    ).pipe(Effect.flip, Effect.runPromise);

    expect(folderError._tag).toBe('InspectionTargetNotFound');
    expect(ignoredError._tag).toBe('InspectionTargetNotFound');
  });
});

describe('inspectModule', () => {
  test('describes Module metadata and both dependency directions', async () => {
    const feature = await inspectModule(
      moduleScenario('valid'),
      'src/feature',
    ).pipe(Effect.runPromise);
    const shared = await inspectModule(
      moduleScenario('valid'),
      'src/shared',
    ).pipe(Effect.runPromise);

    expect(feature.module.kind).toBe('root');
    expect(feature.dependencies).toEqual(['src/shared']);
    expect(feature.dependents).toEqual([]);
    expect(shared.module.kind).toBe('terminal');
    expect(shared.dependents).toEqual(['src/feature']);
    expect(shared.dependencies).toEqual([]);
    expect(shared.publicEntryPoints).toEqual([
      'src/shared/index.ts',
      'src/shared/public/index.ts',
    ]);
  });

  test('shows observed dependencies that have violations', async () => {
    const inspection = await inspectModule(
      moduleScenario('internal-import'),
      'src/feature',
    ).pipe(Effect.runPromise);

    expect(inspection.dependencies).toEqual(['src/shared']);
    expect(inspection.hasViolations).toBe(true);
  });

  test('rejects a Module that participates in a cycle', async () => {
    const error = await inspectModule(moduleScenario('cycle'), 'src/a').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error._tag).toBe('ModuleInspectionCycle');
  });
});
