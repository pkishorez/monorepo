import { expect, test } from 'vitest';

import { feature, layer, layersTopDown, module } from '../src/index.js';
import {
  toDependencyCruiserConfig,
  toVisualizationConfig,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal ProjectConfig with one stack: handlers → services */
function makeConfig(
  overrides: {
    modules?: ReturnType<typeof module>[];
    features?: ReturnType<typeof feature>[];
  } = {},
) {
  const handlers = layer('handlers', ['src/handlers']);
  const services = layer('services', ['src/services']);
  const stack = layersTopDown('app', [handlers, services]);
  return {
    rootDir: '.',
    rules: [stack],
    ...(overrides.modules !== undefined && { modules: overrides.modules }),
    ...(overrides.features !== undefined && { features: overrides.features }),
  };
}

// ---------------------------------------------------------------------------
// toVisualizationConfig — modules
// ---------------------------------------------------------------------------

test('module barrel:true passes through to VisualizationConfig', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/x', { barrel: true })],
  });
  const viz = toVisualizationConfig(cfg);
  const m = viz.modules?.find((m) => m.name === 'x');
  expect(m).toBeDefined();
  expect(m!.barrel).toBe(true);
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
  expect(m!.barrel).toBe(false);
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
// toVisualizationConfig — features
// ---------------------------------------------------------------------------

test('feature compiles to VisualizationConfig.features with correct root and modules', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/a.controller'), module('src/services/svc')],
    features: [
      feature('f', { root: 'a.controller', modules: ['a.controller', 'svc'] }),
    ],
  });
  const viz = toVisualizationConfig(cfg);
  expect(viz.features).toHaveLength(1);
  const f = viz.features![0]!;
  // Bare names resolve to their `layer::name` keys.
  expect(f.root).toBe('handlers::a.controller');
  expect(f.modules).toEqual(['handlers::a.controller', 'services::svc']);
});

test('qualified layer::name members resolve to that exact module', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/a.controller'), module('src/services/svc')],
    features: [
      feature('f', {
        root: 'handlers::a.controller',
        modules: ['handlers::a.controller', 'services::svc'],
      }),
    ],
  });
  const viz = toVisualizationConfig(cfg);
  expect(viz.features![0]!.modules).toEqual([
    'handlers::a.controller',
    'services::svc',
  ]);
});

test('a bare member colliding across layers throws (must qualify)', () => {
  const handlers = layer('handlers', ['src/handlers']);
  const services = layer('services', ['src/services']);
  const cfg = {
    rootDir: '.',
    rules: [layersTopDown('app', [handlers, services])],
    modules: [module('src/handlers/dup'), module('src/services/dup')],
    features: [feature('f', { root: 'dup', modules: ['dup'] })],
  };
  expect(() => toVisualizationConfig(cfg)).toThrow(/ambiguous across layers/);
});

test('a qualified member that names no module throws', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/a')],
    features: [
      feature('f', { root: 'handlers::a', modules: ['handlers::a', 'x::a'] }),
    ],
  });
  expect(() => toVisualizationConfig(cfg)).toThrow(
    /member "x::a" is not a declared module/,
  );
});

test('feature description passes through', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/a')],
    features: [
      feature('f', { root: 'a', modules: ['a'], description: 'My feature' }),
    ],
  });
  const viz = toVisualizationConfig(cfg);
  expect(viz.features![0]!.description).toBe('My feature');
});

test('feature root not a declared module name throws', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/a')],
    features: [feature('f', { root: 'z', modules: ['a', 'z'] })],
  });
  expect(() => toVisualizationConfig(cfg)).toThrow(
    /is not a declared module name/,
  );
});

test('feature member not a declared module name throws', () => {
  const cfg = makeConfig({
    modules: [module('src/handlers/a')],
    features: [feature('f', { root: 'a', modules: ['a', 'missing'] })],
  });
  expect(() => toVisualizationConfig(cfg)).toThrow(
    /member "missing" is not a declared module name/,
  );
});

test('feature with no members throws', () => {
  // feature() itself validates root-in-modules, so craft raw object
  const rawFeature = {
    kind: 'feature' as const,
    name: 'f',
    root: 'a',
    modules: [] as string[],
    config: {},
  };
  const cfg = makeConfig({
    modules: [module('src/handlers/a')],
    features: [rawFeature],
  });
  expect(() => toVisualizationConfig(cfg)).toThrow(/has no members/);
});

// ---------------------------------------------------------------------------
// toDependencyCruiserConfig — layer-ordering rules only
// ---------------------------------------------------------------------------

test('toDependencyCruiserConfig emits only layer-ordering forbidden rules', () => {
  const handlers = layer('handlers', ['src/handlers']);
  const services = layer('services', ['src/services']);
  const stack = layersTopDown('app', [handlers, services]);
  const { forbidden } = toDependencyCruiserConfig([stack]);
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
