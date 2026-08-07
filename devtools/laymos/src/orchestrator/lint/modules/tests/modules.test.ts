import { fileURLToPath } from 'node:url';

import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { ConfigServiceLive } from '../../../../services/config/index.js';
import { CruiserLive } from '../../../../services/file-cruiser/index.js';
import { analyzeModules } from '../index.js';

function scenario(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../../tests/fixtures/modules/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

function analyzeScenario(name: string) {
  return analyzeModules(scenario(name)).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

describe('analyzeModules orchestrator', () => {
  test('accepts root and nested public entry points', async () => {
    await expect(analyzeScenario('valid')).resolves.toMatchObject({
      violations: [],
    });
  });

  test('reports an uncovered file', async () => {
    await expect(analyzeScenario('coverage')).resolves.toMatchObject({
      violations: [{ kind: 'coverage', file: 'src/loose.ts' }],
    });
  });

  test('reports missing Module entry points', async () => {
    await expect(
      analyzeScenario('missing-entry-points'),
    ).resolves.toMatchObject({
      violations: [
        {
          kind: 'missing-entry-point',
          module: 'src/feature',
          path: 'src/feature/index.ts',
        },
        {
          kind: 'missing-entry-point',
          module: 'src/feature',
          path: 'src/feature/public/index.ts',
        },
      ],
    });
  });

  test('reports a forbidden same-Layer dependency', async () => {
    const result = await analyzeScenario('forbidden-peer');
    expect(result.violations[0]?.kind).toBe('dependency');
  });

  test('reports an import through an internal file', async () => {
    const result = await analyzeScenario('internal-import');
    expect(result.violations[0]?.kind).toBe('boundary');
  });

  test('reports a valid cross-Module cycle', async () => {
    await expect(analyzeScenario('cycle')).resolves.toMatchObject({
      violations: [
        { kind: 'cycle', modules: ['src/feature-a', 'src/feature-b'] },
      ],
    });
  });
});
