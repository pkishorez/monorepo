import { describe, it, expect } from 'vitest';
import { computeLayerLayout } from './layer-layout';
import type { VisualizationConfig, VizSummary } from '../../model';

const CONFIG: VisualizationConfig = {
  rootDir: '.',
  stacks: [
    {
      name: 'web',
      allowedImports: [],
      edges: [
        { from: 'routes', to: 'services' },
        { from: 'services', to: 'data' },
      ],
      layers: [
        { name: 'routes', paths: ['src/routes'] },
        { name: 'services', paths: ['src/services'] },
        { name: 'data', paths: ['src/data'] },
      ],
    },
    {
      name: 'api',
      allowedImports: [],
      edges: [
        { from: 'controllers', to: 'services' },
        { from: 'services', to: 'db' },
      ],
      layers: [
        { name: 'controllers', paths: ['src/controllers'] },
        { name: 'services', paths: ['src/services'] },
        { name: 'db', paths: ['src/db'] },
      ],
    },
  ],
  modules: [
    {
      path: 'src/routes/home',
      layer: 'routes',
      name: 'home',
      opaque: false,
    },
    {
      path: 'src/services/auth',
      layer: 'services',
      name: 'auth',
      opaque: false,
    },
  ],
};

const SUMMARY: VizSummary = {
  violations: [
    {
      from: 'routes',
      to: 'data',
      fromFile: 'src/routes/home.ts',
      toFile: 'src/data/db.ts',
      rule: 'no-forbidden-imports',
      severity: 'error',
    },
  ],
  moduleCoverage: [],
  layerOrphanFiles: [],
  ignoredFiles: [],
  coveredFiles: [],
  coverageGaps: [],
  emptyModules: [],
  conflicts: [],
  moduleOverlaps: [],
  moduleEdges: [],
  moduleViolations: [],
};

describe('computeLayerLayout characterization', () => {
  it('matches snapshot without summary or selection', () => {
    const result = computeLayerLayout(CONFIG);
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot with summary', () => {
    const result = computeLayerLayout(CONFIG, SUMMARY);
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot with selectedLayer', () => {
    const result = computeLayerLayout(CONFIG, undefined, 'routes');
    expect(result).toMatchSnapshot();
  });

  it('draws a violation edge only for the selected violation', () => {
    const result = computeLayerLayout(CONFIG, SUMMARY, null, {
      from: 'routes',
      to: 'data',
    });
    const violationEdges = result.edges.filter((e) =>
      e.id.startsWith('violation:'),
    );
    expect(violationEdges).toHaveLength(1);
    expect(violationEdges[0]).toMatchObject({
      source: 'routes',
      target: 'data',
    });
  });

  it('draws no violation edges without a selected violation', () => {
    const result = computeLayerLayout(CONFIG, SUMMARY);
    expect(result.edges.some((e) => e.id.startsWith('violation:'))).toBe(false);
  });
});

const DIAMOND_CONFIG: VisualizationConfig = {
  rootDir: '.',
  stacks: [
    {
      name: 'app',
      allowedImports: [],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
      ],
      layers: [
        { name: 'a', paths: ['src/a'] },
        { name: 'b', paths: ['src/b'] },
        { name: 'c', paths: ['src/c'] },
        { name: 'd', paths: ['src/d'] },
      ],
    },
  ],
  modules: [],
};

describe('computeLayerLayout diamond', () => {
  it('draws exactly the direct DAG edges', () => {
    const { edges } = computeLayerLayout(DIAMOND_CONFIG);
    const pairs = edges.map((e) => `${e.source}->${e.target}`).sort();
    expect(pairs).toEqual(['a->b', 'a->c', 'b->d', 'c->d']);
  });

  it('places siblings side by side without overlap', () => {
    const { nodes } = computeLayerLayout(DIAMOND_CONFIG);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const b = byId.get('b')!;
    const c = byId.get('c')!;
    expect(b.position.y).toBe(c.position.y);
    expect(Math.abs(b.position.x - c.position.x)).toBeGreaterThanOrEqual(
      b.width!,
    );
    const a = byId.get('a')!;
    const d = byId.get('d')!;
    expect(a.position.y).toBeLessThan(b.position.y);
    expect(d.position.y).toBeGreaterThan(b.position.y);
  });

  it('colors outgoing and incoming edges of the selected layer distinctly', () => {
    const { edges } = computeLayerLayout(DIAMOND_CONFIG, undefined, 'b');
    const byPair = new Map(edges.map((e) => [`${e.source}->${e.target}`, e]));
    const incoming = byPair.get('a->b')!;
    const outgoing = byPair.get('b->d')!;
    const unrelated = byPair.get('a->c')!;
    expect(incoming.style!.stroke).not.toBe(outgoing.style!.stroke);
    expect(incoming.style!.opacity).toBe(1);
    expect(outgoing.style!.opacity).toBe(1);
    expect(unrelated.style!.opacity).toBeLessThan(1);
    expect(unrelated.style!.stroke).not.toBe(incoming.style!.stroke);
    expect(unrelated.style!.stroke).not.toBe(outgoing.style!.stroke);
  });

  it('marks only the root as entry', () => {
    const { nodes } = computeLayerLayout(DIAMOND_CONFIG);
    const entries = nodes
      .filter(
        (n) => n.type === 'layer' && (n.data as { isEntry: boolean }).isEntry,
      )
      .map((n) => n.id);
    expect(entries).toEqual(['a']);
  });
});
