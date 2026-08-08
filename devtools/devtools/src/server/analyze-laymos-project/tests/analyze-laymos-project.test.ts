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
    expect(analysis.layerAnalysis.membership.size).toBeGreaterThan(0);
    expect(analysis.moduleAnalysis.modules.length).toBeGreaterThan(0);
  });
});
