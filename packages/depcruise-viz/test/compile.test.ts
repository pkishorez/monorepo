import { expect, test } from 'vitest';

import { edge, layer, layerGraph, module } from '../src/index.js';
import {
  toDependencyCruiserConfig,
  toVisualizationConfig,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal ProjectConfig with one graph: handlers → services */
function makeConfig(
  overrides: {
    modules?: ReturnType<typeof module>[];
  } = {},
) {
  const handlers = layer('handlers', ['src/handlers']);
  const services = layer('services', ['src/services']);
  const graph = layerGraph('app', [edge(handlers, services)]);
  return {
    rootDir: '.',
    rules: [graph],
    ...(overrides.modules !== undefined && { modules: overrides.modules }),
  };
}

// ---------------------------------------------------------------------------
// toVisualizationConfig — modules
// ---------------------------------------------------------------------------

test('module opaque:true passes through to VisualizationConfig', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/x', { opaque: true })],
  });
  const viz = toVisualizationConfig(cfg);
  const m = viz.modules?.find((m) => m.name === 'x');
  expect(m).toBeDefined();
  expect(m!.opaque).toBe(true);
  expect(m!.layer).toBe('handlers');
});

test('module name is derived from path tail below layer path', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/order-items')],
  });
  const viz = toVisualizationConfig(cfg);
  const m = viz.modules?.find((m) => m.name === 'order-items');
  expect(m).toBeDefined();
  expect(m!.layer).toBe('handlers');
  expect(m!.opaque).toBe(false);
});

test('explicit module name overrides the derived name', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/order-items', { name: 'orders' })],
  });
  const viz = toVisualizationConfig(cfg);
  expect(viz.modules?.map((m) => m.name)).toEqual(['orders']);
});

test('file module keeps its extension in the derived name', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/logger.ts')],
  });
  const viz = toVisualizationConfig(cfg);
  expect(viz.modules?.map((m) => m.name)).toEqual(['logger.ts']);
});

test('file module declared at exactly the layer path keeps the extension', () => {
  const handlers = layer('handlers', ['src/handlers']);
  const types = layer('types', ['src/types.ts']);
  const cfg = {
    rootDir: '.',
    rules: [layerGraph('app', [edge(handlers, types)])],
    modules: [module('src/types.ts')],
  };
  const viz = toVisualizationConfig(cfg);
  expect(viz.modules?.map((m) => m.name)).toEqual(['types.ts']);
});

test('module path not under any layer throws', () => {
  const cfg = makeConfig({
    modules: [module('src/unknown/x')],
  });
  expect(() => toVisualizationConfig(cfg)).toThrow(
    /does not sit under any layer/,
  );
});

test('duplicate module path throws', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/x'), module('src/handlers/x')],
  });
  expect(() => toVisualizationConfig(cfg)).toThrow(/Duplicate module path/);
});

// ---------------------------------------------------------------------------
// toDependencyCruiserConfig — layer-ordering rules only
// ---------------------------------------------------------------------------

test('toDependencyCruiserConfig emits only layer-ordering forbidden rules', () => {
  const handlers = layer('handlers', ['src/handlers']);
  const services = layer('services', ['src/services']);
  const graph = layerGraph('app', [edge(handlers, services)]);
  const { forbidden } = toDependencyCruiserConfig([graph]);
  expect(forbidden).toBeDefined();
  // All rule names must reference layer ordering — none should mention visibility/shared/private/breach
  for (const rule of forbidden!) {
    expect(rule.name).not.toMatch(/visibility|shared|private|breach/i);
  }
  // Must have a rule preventing services from importing handlers
  const blocksUpwardImport = forbidden!.some((r) => {
    if (!('to' in r) || r.to == null) return false;
    return (
      r.from.path?.includes('src/services') &&
      (r.to as { path?: string }).path?.includes('src/handlers')
    );
  });
  expect(blocksUpwardImport).toBe(true);
});

// ---------------------------------------------------------------------------
// layerGraph — reachability semantics (diamond: server → {entrypoints, routes} → components → lib)
// ---------------------------------------------------------------------------

function makeDiamond() {
  const server = layer('server', ['src/server']);
  const entrypoints = layer('entrypoints', ['src/entrypoints']);
  const routes = layer('routes', ['src/routes']);
  const components = layer('components', ['src/components']);
  const lib = layer('lib', ['src/lib']);
  return layerGraph('frontend', [
    edge(server, entrypoints),
    edge(server, routes),
    edge(entrypoints, components),
    edge(routes, components),
    edge(components, lib),
  ]);
}

test('allowedImports is the transitive closure of the graph', () => {
  const viz = toVisualizationConfig({ rootDir: '.', rules: [makeDiamond()] });
  const allowed = new Set(
    viz.stacks[0]!.allowedImports.map((p) => `${p.from}->${p.to}`),
  );
  expect(allowed.has('server->lib')).toBe(true);
  expect(allowed.has('entrypoints->components')).toBe(true);
  expect(allowed.has('routes->lib')).toBe(true);
  expect(allowed.has('entrypoints->routes')).toBe(false);
  expect(allowed.has('routes->entrypoints')).toBe(false);
  expect(allowed.has('lib->server')).toBe(false);
});

test('edges carries the direct DAG edges without closure pairs', () => {
  const viz = toVisualizationConfig({ rootDir: '.', rules: [makeDiamond()] });
  const edges = viz.stacks[0]!.edges.map((e) => `${e.from}->${e.to}`);
  expect(edges).toEqual([
    'server->entrypoints',
    'server->routes',
    'entrypoints->components',
    'routes->components',
    'components->lib',
  ]);
});

test('edges drops redundant transitive authored edges', () => {
  const a = layer('a', ['src/a']);
  const b = layer('b', ['src/b']);
  const c = layer('c', ['src/c']);
  const graph = layerGraph('app', [edge(a, b), edge(b, c), edge(a, c)]);
  const viz = toVisualizationConfig({ rootDir: '.', rules: [graph] });
  expect(viz.stacks[0]!.edges).toEqual([
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ]);
});

test('siblings are forbidden in both directions', () => {
  const { forbidden } = toDependencyCruiserConfig([makeDiamond()]);
  const names = forbidden!.map((r) => r.name);
  expect(names).toContain('frontend: entrypoints cannot import routes');
  expect(names).toContain('frontend: routes cannot import entrypoints');
  expect(names).toContain('frontend: lib cannot import server');
  expect(names).not.toContain('frontend: server cannot import lib');
});

test('graph cycle throws at compile time', () => {
  const a = layer('a', ['src/a']);
  const b = layer('b', ['src/b']);
  const c = layer('c', ['src/c']);
  const cyclic = layerGraph('app', [edge(a, b), edge(b, c), edge(c, a)]);
  expect(() =>
    toVisualizationConfig({ rootDir: '.', rules: [cyclic] }),
  ).toThrow(/cycle/i);
});

test('module rules pass through to VisualizationConfig', () => {
  const cfg = makeConfig({
    modules: [
      module('src/handlers/x', { rules: { onlyImports: ['src/handlers/y'] } }),
      module('src/handlers/y'),
    ],
  });
  const viz = toVisualizationConfig(cfg);
  const m = viz.modules?.find((m) => m.name === 'x');
  expect(m!.rules).toEqual({ onlyImports: ['src/handlers/y'] });
});

test('module rule referencing an undeclared module path throws', () => {
  const cfg = makeConfig({
    modules: [
      module('src/handlers/x', {
        rules: { onlyImports: ['src/handlers/nope'] },
      }),
    ],
  });
  expect(() => toVisualizationConfig(cfg)).toThrow(
    /references "src\/handlers\/nope", which is not a declared module path/,
  );
});

test('minimal config without rules compiles', () => {
  expect(toDependencyCruiserConfig()).toEqual({ forbidden: [] });
  expect(toVisualizationConfig({ rootDir: 'src' })).toEqual({
    rootDir: 'src',
    stacks: [],
  });
});
