import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import {
  inspectFile,
  inspectLayer,
  inspectModule,
  inspectProject,
} from '../index.js';

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
      dependencies: [{ path: 'src/shared/index.ts', kind: 'direct' }],
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

    expect(feature.module.shared).toBe(false);
    expect(feature.module.exposed).toBe(true);
    expect(feature.module.observedKind).toBe('root');
    expect(feature.dependencies).toEqual(['src/shared']);
    expect(feature.dependents).toEqual([]);
    expect(shared.module.shared).toBe(true);
    expect(shared.module.observedKind).toBe('terminal');
    expect(shared.dependents).toEqual(['src/feature']);
    expect(shared.dependencies).toEqual([]);
    expect(shared.publicEntryPoints).toEqual(['src/shared/index.ts']);
  });

  test('shows observed dependencies that have violations', async () => {
    const inspection = await inspectModule(
      moduleScenario('internal-import'),
      'src/feature',
    ).pipe(Effect.runPromise);

    expect(inspection.dependencies).toEqual(['src/shared']);
    expect(inspection.hasViolations).toBe(true);
  });

  test('reports an unused Shared Module as having violations', async () => {
    const inspection = await inspectModule(
      moduleScenario('unused-shared'),
      'src/shared',
    ).pipe(Effect.runPromise);

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

describe('inspectProject', () => {
  test('returns the canonical Architecture Analysis', async () => {
    const inspection = await inspectProject(moduleScenario('valid')).pipe(
      Effect.runPromise,
    );

    expect(inspection.config.layers).toHaveProperty('app');
    expect(inspection.moduleAnalysis.modules).toHaveLength(2);
  });
});

describe('inspectLayer', () => {
  test('shows one Layer and its Modules', async () => {
    const inspection = await inspectLayer(moduleScenario('valid'), 'app').pipe(
      Effect.runPromise,
    );

    expect(inspection.id).toBe('app');
    expect(inspection.modules.map(({ path }) => path)).toEqual([
      'src/feature',
      'src/shared',
    ]);
    expect(inspection.sharedCount).toBe(1);
    expect(inspection.moduleViolations).toEqual([]);
  });

  test('includes Module coverage findings in the Layer', async () => {
    const inspection = await inspectLayer(
      moduleScenario('coverage'),
      'app',
    ).pipe(Effect.runPromise);

    expect(inspection.moduleViolations).toContainEqual({
      kind: 'coverage',
      file: 'src/loose.ts',
    });
  });

  test('includes unused Shared Module findings in the Layer', async () => {
    const inspection = await inspectLayer(
      moduleScenario('unused-shared'),
      'app',
    ).pipe(Effect.runPromise);

    expect(inspection.moduleViolations).toContainEqual({
      kind: 'unused-shared',
      module: 'src/shared',
    });
  });

  test('reports a Layer without configured Modules', async () => {
    const inspection = await inspectLayer(
      layerScenario('no-modules'),
      'empty',
    ).pipe(Effect.runPromise);

    expect(inspection.hasNoModules).toBe(true);
  });

  test('rejects an unknown Layer', async () => {
    const error = await inspectLayer(moduleScenario('valid'), 'missing').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error._tag).toBe('InspectionTargetNotFound');
    if (error._tag === 'InspectionTargetNotFound') {
      expect(error.targetKind).toBe('layer');
    }
  });
});
