import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { queryDependencies } from '../index.js';

function scenario(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/layers/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

describe('queryDependencies', () => {
  test('uses the analysis universe declared by Config', async () => {
    const entries = await queryDependencies(
      scenario('valid-transitive-dependency'),
      'src/application',
      { recursive: true },
    ).pipe(Effect.runPromise);

    expect(entries).toEqual([
      { path: 'src/domain/user.ts', kind: 'direct' },
      { path: 'src/infrastructure/database.ts', kind: 'direct' },
    ]);
  });

  test('rejects an ignored Target', async () => {
    const error = await queryDependencies(
      scenario('ignored-file'),
      'src/generated/client.ts',
    ).pipe(Effect.flip, Effect.runPromise);

    expect(error._tag).toBe('DependencyTargetNotFound');
  });
});
