import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach } from 'vitest';

import { loadConfig } from '../src/config/load-config/index.js';
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

laymosDescribe(
  'Configuration loading',
  {
    description:
      'Imports authored configuration and reports malformed nested values consistently.',
    documentation: `
## Loading contract

Configuration is executed from the target project and then validated as one
complete value. Invalid nested values fail with a stable public error rather
than leaking loader or schema internals.
`,
  },
  () => {
    const cases = [
      [
        'rejects malformed layer graphs',
        `export default {
  sourceRoots: ['src'],
  graphs: [{ kind: 'layer-graph' }],
};`,
      ],
      [
        'rejects non-string source roots',
        `export default {
  sourceRoots: [42],
  graphs: [],
};`,
      ],
      [
        'rejects malformed module paths',
        `export default {
  sourceRoots: ['src'],
  graphs: [],
  modules: [{ kind: 'module', path: 42, description: 'Invalid module' }],
};`,
      ],
    ] as const;

    for (const [name, source] of cases) {
      laymosTest(
        name,
        {
          description:
            'Returns the stable validation error for malformed configuration.',
        },
        async ({ expect }) => {
          expect(
            await loadInvalidConfig(source),
            'reports the public configuration validation error',
          ).toBe('ConfigValidationError');
        },
      );
    }
  },
);

async function loadInvalidConfig(source: string): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), 'laymos-config-'));
  temporaryDirectories.push(projectDir);
  await writeFile(join(projectDir, 'laymos.config.ts'), source);
  return Effect.runPromise(
    loadConfig({ projectDir }).pipe(
      Effect.match({
        onFailure: (error) => error._tag,
        onSuccess: () => 'loaded',
      }),
    ),
  );
}
