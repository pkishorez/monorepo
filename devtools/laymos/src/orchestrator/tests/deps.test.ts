import { fileURLToPath } from 'node:url';

import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import {
  ConfigService,
  ConfigServiceLive,
} from '../../services/config/index.js';
import { Cruiser, CruiserLive } from '../../services/file-cruiser/index.js';
import { deps } from '../deps.js';

function scenario(name: string): string {
  return fileURLToPath(
    new URL(
      `../../tests/fixtures/layers/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

function run<A, E>(effect: Effect.Effect<A, E, ConfigService | Cruiser>) {
  return effect.pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

describe('deps orchestrator', () => {
  test('uses the analysis universe declared by config', async () => {
    const entries = await run(
      deps(
        scenario('valid-transitive-dependency'),
        'src/application',
        'folder',
        { recursive: true },
      ),
    );

    expect(entries).toEqual([
      { path: 'src/domain/user.ts', kind: 'direct' },
      { path: 'src/infrastructure/database.ts', kind: 'direct' },
    ]);
  });

  test('rejects an ignored target', async () => {
    const error = await run(
      deps(scenario('ignored-file'), 'src/generated/client.ts', 'file').pipe(
        Effect.flip,
      ),
    );

    expect(error._tag).toBe('DepsTargetError');
  });
});
