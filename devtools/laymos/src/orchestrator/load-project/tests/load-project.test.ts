import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, test } from 'vitest';

import { ConfigServiceLive } from '../../../services/config/index.js';
import { CruiserLive } from '../../../services/file-cruiser/index.js';
import { loadProject } from '../index.js';

function run(configPath: string) {
  return loadProject(configPath).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

function fixture(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

describe('loadProject', () => {
  test('threads sourceRoots and ignoredPaths to the Cruiser', async () => {
    const { fileGraph } = await run(fixture('layers/ignored-file')).pipe(
      Effect.runPromise,
    );

    expect([...fileGraph.keys()]).toContain('src/app/main.ts');
    expect([...fileGraph.keys()]).not.toContain('src/generated/client.ts');
  });

  test('surfaces validateLoadedConfig issues as a Config validation ConfigError', async () => {
    const error = await run(fixture('modules/file-module-nested')).pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'ConfigError',
      reason: 'validation',
      issues: [
        {
          kind: 'module',
          message: 'File Module src/button.ts cannot expose Subpaths',
        },
      ],
    });
  });
});
