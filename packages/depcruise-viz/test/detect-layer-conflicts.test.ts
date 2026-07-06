import { describe, expect, it } from 'vitest';

import { detectLayerConflicts } from '../src/analyze/detect-layer-conflicts.js';
import type { VisualizationConfig } from '../src/types.js';

function viz(
  layers: Array<{ name: string; paths: string[] }>,
): VisualizationConfig {
  return {
    rootDir: 'src',
    stacks: [{ name: 's', layers, edges: [], allowedImports: [] }],
  };
}

describe('detectLayerConflicts', () => {
  it('reports nested overlapping paths between distinct layers', () => {
    const conflicts = detectLayerConflicts(
      viz([
        { name: 'routes', paths: ['src/routes'] },
        { name: 'otel', paths: ['src/routes/otel'] },
      ]),
    );
    expect(conflicts).toEqual([
      {
        layerA: 'otel',
        layerB: 'routes',
        pathA: 'src/routes/otel',
        pathB: 'src/routes',
      },
    ]);
  });

  it('reports identical paths on distinct layers', () => {
    const conflicts = detectLayerConflicts(
      viz([
        { name: 'a', paths: ['src/x'] },
        { name: 'b', paths: ['src/x'] },
      ]),
    );
    expect(conflicts).toHaveLength(1);
  });

  it('does not report sibling (non-overlapping) paths', () => {
    const conflicts = detectLayerConflicts(
      viz([
        { name: 'a', paths: ['src/a'] },
        { name: 'b', paths: ['src/ab'] },
      ]),
    );
    expect(conflicts).toEqual([]);
  });

  it('never reports a layer against itself (shared across stacks)', () => {
    const config: VisualizationConfig = {
      rootDir: 'src',
      stacks: [
        {
          name: 's1',
          layers: [{ name: 'domain', paths: ['src/domain'] }],
          edges: [],
          allowedImports: [],
        },
        {
          name: 's2',
          layers: [{ name: 'domain', paths: ['src/domain'] }],
          edges: [],
          allowedImports: [],
        },
      ],
    };
    expect(detectLayerConflicts(config)).toEqual([]);
  });
});
