import { resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { analyzeLaymosProject } from '../index.js';

describe('analyzeLaymosProject', () => {
  test('rejects a relative Project path', async () => {
    const error = await analyzeLaymosProject('../laymos').pipe(
      Effect.flip,
      Effect.runPromise,
    );

    expect(error).toMatchObject({
      _tag: 'InvalidProjectPath',
      reason: 'relative',
    });
  });

  test('returns Architecture Analysis for an absolute Project path', async () => {
    const analysis = await analyzeLaymosProject(
      resolve(process.cwd(), '../laymos'),
    ).pipe(Effect.runPromise);

    expect(analysis.config.sourceRoots).toEqual(['src']);
    expect(analysis.tree.nodes.length).toBeGreaterThan(0);
    expect(Object.keys(analysis.tree.owners).length).toBeGreaterThan(0);
  });
});
