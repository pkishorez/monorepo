import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { inspectFile, inspectModule, inspectProject } from '../index.js';

const shop = fileURLToPath(
  new URL(
    '../../../tests/fixtures/tree/shop/laymos.config.json',
    import.meta.url,
  ),
);

describe('inspectFile', () => {
  test('describes the owning Module, the role, and the dependencies', async () => {
    const inspection = await inspectFile(shop, 'src/app/index.ts').pipe(
      Effect.runPromise,
    );

    expect(inspection).toEqual({
      path: 'src/app/index.ts',
      owner: 'src/app',
      role: 'index',
      dependencies: [
        { path: 'src/domain/orders/index.ts', kind: 'direct' },
        { path: 'src/domain/orders/internal.ts', kind: 'direct' },
        { path: 'src/infra/index.ts', kind: 'direct' },
      ],
      recursive: false,
    });
  });

  test('keeps a file no Module owns inspectable', async () => {
    const inspection = await inspectFile(shop, 'scripts/seed.ts').pipe(
      Effect.runPromise,
    );

    expect(inspection.owner).toBe('scripts');
    expect(inspection.role).toBe('uncovered');
  });

  test('rejects a folder and an ignored file', async () => {
    const folderError = await inspectFile(shop, 'src/app').pipe(
      Effect.flip,
      Effect.runPromise,
    );
    const ignoredError = await inspectFile(
      shop,
      'src/domain/orders/generated.ts',
    ).pipe(Effect.flip, Effect.runPromise);

    expect(folderError._tag).toBe('InspectionTargetNotFound');
    expect(ignoredError._tag).toBe('InspectionTargetNotFound');
  });
});

describe('inspectModule', () => {
  test('describes a Module, its Reach, and both dependency directions', async () => {
    const orders = await inspectModule(shop, 'src/domain/orders').pipe(
      Effect.runPromise,
    );

    expect(orders.node.kind).toBe('module');
    expect(orders.node.index).toBe('src/domain/orders/index.ts');
    expect(orders.reach.rules).toEqual([
      { from: 'src/domain', to: 'src/core' },
    ]);
    expect(orders.dependents).toEqual(['src/app']);
    expect(orders.dependencies).toEqual(['src/core/ids.ts']);
    expect(orders.hasViolations).toBe(true);
  });

  test('describes a Wrapper as everything inside it', async () => {
    const domain = await inspectModule(shop, 'src/domain').pipe(
      Effect.runPromise,
    );

    expect(domain.node.kind).toBe('wrapper');
    expect(domain.dependents).toEqual(['src/app']);
    expect(domain.dependencies).toEqual(['src/core/ids.ts']);
  });

  test('rejects a path that is no node', async () => {
    const error = await inspectModule(shop, 'src/nowhere').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error._tag).toBe('InspectionTargetNotFound');
  });
});

describe('inspectProject', () => {
  test('returns the canonical Architecture Analysis', async () => {
    const inspection = await inspectProject(shop).pipe(Effect.runPromise);

    expect(inspection.tree.nodes).toHaveLength(9);
    expect(inspection.imports).toHaveLength(6);
  });
});
