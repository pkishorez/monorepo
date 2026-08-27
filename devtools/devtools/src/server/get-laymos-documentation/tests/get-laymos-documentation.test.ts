import { resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { getLaymosDocumentation } from '../index.js';

const projectPath = resolve(
  process.cwd(),
  '../laymos/src/tests/fixtures/modules/valid',
);

describe('getLaymosDocumentation', () => {
  test('returns a Configured Module’s README.md', async () => {
    const documentation = await getLaymosDocumentation(projectPath, {
      kind: 'module',
      modulePath: 'src/shared',
    }).pipe(Effect.runPromise);

    expect(documentation.path).toBe('src/shared/README.md');
    expect(documentation.content).toContain('Docs for the shared module.');
  });

  test('returns a Layer’s declared docsPath', async () => {
    const documentation = await getLaymosDocumentation(projectPath, {
      kind: 'layer',
      layerId: 'app',
    }).pipe(Effect.runPromise);

    expect(documentation.path).toBe('docs/app.md');
  });

  test('reports an unknown scope', async () => {
    const error = await getLaymosDocumentation(projectPath, {
      kind: 'layer',
      layerId: 'unknown',
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({ _tag: 'DocumentationScopeNotFoundError' });
  });
});
