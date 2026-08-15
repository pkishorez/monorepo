import { fileURLToPath } from 'node:url';

import { Effect, Schema } from 'effect';
import { describe, expect, test } from 'vitest';

import { ArchitectureAnalysisSchema } from '../../../architecture-analysis-schema/index.js';
import { analyzeProject } from '../index.js';

function fixture(name: string): string {
  return fileURLToPath(
    new URL(
      `../../../tests/fixtures/${name}/laymos.config.json`,
      import.meta.url,
    ),
  );
}

describe('analyzeProject', () => {
  test('returns a complete Architecture Analysis', async () => {
    const analysis = await analyzeProject(fixture('modules/valid')).pipe(
      Effect.runPromise,
    );

    expect(analysis.config.sourceRoots).toEqual(['src']);
    expect(analysis.layerAnalysis.membership.size).toBeGreaterThan(0);
    expect(analysis.moduleAnalysis.modules.length).toBe(2);
  });

  test('surfaces Module violations from a dirty project', async () => {
    const analysis = await analyzeProject(
      fixture('modules/internal-import'),
    ).pipe(Effect.runPromise);

    expect(analysis.moduleAnalysis.violations).toEqual([
      {
        kind: 'boundary',
        fromFile: 'src/feature/index.ts',
        fromModule: 'src/feature',
        toFile: 'src/shared/internal.ts',
        toModule: 'src/shared',
      },
      { kind: 'unused-shared', module: 'src/shared' },
    ]);
  });

  test('surfaces unassigned files from a dirty project', async () => {
    const analysis = await analyzeProject(
      fixture('layers/unassigned-file'),
    ).pipe(Effect.runPromise);

    expect(analysis.layerAnalysis.unassignedFiles).toEqual([
      'src/shared/log.ts',
    ]);
  });

  test('round-trips maps and sets through its runtime schema', async () => {
    const analysis = await analyzeProject(fixture('modules/valid')).pipe(
      Effect.runPromise,
    );
    const codec = Schema.toCodecJson(ArchitectureAnalysisSchema);
    const encoded = Schema.encodeSync(codec)(analysis);
    const decoded = Schema.decodeUnknownSync(codec)(
      JSON.parse(JSON.stringify(encoded)),
    );

    expect(decoded.layerAnalysis.membership).toBeInstanceOf(Map);
    expect(decoded.moduleAnalysis.entryPoints).toBeInstanceOf(Set);
    expect(decoded.layerAnalysis.membership).toEqual(
      analysis.layerAnalysis.membership,
    );
  });
});
