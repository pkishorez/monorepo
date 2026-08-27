import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { loadDocumentation } from '../index.js';

const configPath = fileURLToPath(
  new URL(
    '../../../tests/fixtures/modules/valid/laymos.config.json',
    import.meta.url,
  ),
);

const unreadableDocsConfigPath = fileURLToPath(
  new URL(
    '../../../tests/fixtures/modules/unreadable-docs/laymos.config.json',
    import.meta.url,
  ),
);

describe('loadDocumentation', () => {
  test('reads a Configured Module’s README.md', async () => {
    const documentation = await loadDocumentation(configPath, {
      kind: 'module',
      modulePath: 'src/shared',
    }).pipe(Effect.runPromise);

    expect(documentation.path).toBe('src/shared/README.md');
    expect(documentation.content).toContain('Docs for the shared module.');
  });

  test('is silently absent for a Configured Module with no README.md', async () => {
    const documentation = await loadDocumentation(configPath, {
      kind: 'module',
      modulePath: 'src/feature',
    }).pipe(Effect.runPromise);

    expect(documentation.path).toBeUndefined();
    expect(documentation.content).toBeUndefined();
  });

  test('reports a Configured Module README.md read failure', async () => {
    const error = await loadDocumentation(unreadableDocsConfigPath, {
      kind: 'module',
      modulePath: 'src/broken-docs',
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({ _tag: 'DocumentationReadError' });
  });

  test('rejects a path that is not a Configured Module', async () => {
    const error = await loadDocumentation(configPath, {
      kind: 'module',
      modulePath: 'src/missing',
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({ _tag: 'DocumentationScopeNotFound' });
  });

  test('reads a Layer’s declared docsPath', async () => {
    const documentation = await loadDocumentation(configPath, {
      kind: 'layer',
      layerId: 'app',
    }).pipe(Effect.runPromise);

    expect(documentation.path).toBe('docs/app.md');
    expect(documentation.content).toContain('Layer-level story.');
  });

  test('reads a LayerGraph’s declared docsPath', async () => {
    const documentation = await loadDocumentation(configPath, {
      kind: 'layer-graph',
      graphId: 'core',
    }).pipe(Effect.runPromise);

    expect(documentation.path).toBe('docs/architecture.md');
    expect(documentation.content).toContain('LayerGraph-level story.');
  });

  test('rejects a LayerGraph id that does not exist', async () => {
    const error = await loadDocumentation(configPath, {
      kind: 'layer-graph',
      graphId: 'missing',
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({ _tag: 'DocumentationScopeNotFound' });
  });

  test('rejects a Module Graph in a Layer that does not exist', async () => {
    const error = await loadDocumentation(configPath, {
      kind: 'module-graph',
      layerId: 'missing',
      graphId: 'missing',
    }).pipe(Effect.flip, Effect.runPromise);

    expect(error).toMatchObject({ _tag: 'DocumentationScopeNotFound' });
  });
});
