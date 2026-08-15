import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { inspectProject } from '../../../../orchestrator/inspect/index.js';
import { renderProjectJson } from '../project.js';

const configPath = fileURLToPath(
  new URL(
    '../../../../tests/fixtures/modules/valid/laymos.config.json',
    import.meta.url,
  ),
);

describe('renderProjectJson', () => {
  test('encodes Maps and Sets as stable JSON arrays', async () => {
    const inspection = await inspectProject(configPath).pipe(Effect.runPromise);
    const output = JSON.parse(renderProjectJson(inspection));

    expect(output.layerAnalysis.membership).toBeInstanceOf(Array);
    expect(output.layerAnalysis.allowedDependencies).toBeInstanceOf(Array);
    expect(output.moduleAnalysis.entryPoints).toBeInstanceOf(Array);
  });
});
