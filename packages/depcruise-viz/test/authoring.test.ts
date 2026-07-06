import { expect, test } from 'vitest';

import { edge, layer, layerGraph, module } from '../src/index.js';

test('module() returns path and opaque:false by default', () => {
  const m = module('src/routes/orders');
  expect(m.path).toBe('src/routes/orders');
  expect(m.opaque).toBe(false);
  expect(m.name).toBeUndefined();
});

test('module() with opaque:true sets opaque', () => {
  const m = module('src/routes/orders', { opaque: true });
  expect(m.opaque).toBe(true);
});

test('module() with opaque:false is explicit false', () => {
  const m = module('src/routes/orders', { opaque: false });
  expect(m.opaque).toBe(false);
});

test('module() with name sets name', () => {
  const m = module('src/routes/orders', { name: 'order-routes' });
  expect(m.name).toBe('order-routes');
});

test('module() with empty path throws', () => {
  expect(() => module('')).toThrow(/empty/);
});

test('layerGraph() derives layers from edge endpoints in order', () => {
  const a = layer('a', ['src/a']);
  const b = layer('b', ['src/b']);
  const c = layer('c', ['src/c']);
  const g = layerGraph('app', [edge(a, b), edge(b, c)]);
  expect(g.kind).toBe('layer-graph');
  expect(g.layers.map((l) => l.name)).toEqual(['a', 'b', 'c']);
});

test('edge() with the same layer on both sides throws', () => {
  const a = layer('a', ['src/a']);
  expect(() => edge(a, a)).toThrow(/self-edge/);
});

test('edge() with an array of targets fans out to one edge per target', () => {
  const a = layer('a', ['src/a']);
  const b = layer('b', ['src/b']);
  const c = layer('c', ['src/c']);
  expect(edge(a, [b, c])).toEqual([edge(a, b), edge(a, c)]);
});

test('edge() with an empty target array throws', () => {
  const a = layer('a', ['src/a']);
  expect(() => edge(a, [])).toThrow(/at least 1 target/);
});

test('edge() with an array containing the from layer throws', () => {
  const a = layer('a', ['src/a']);
  const b = layer('b', ['src/b']);
  expect(() => edge(a, [b, a])).toThrow(/self-edge/);
});

test('layerGraph() flattens fan-out edges and still rejects duplicates', () => {
  const a = layer('a', ['src/a']);
  const b = layer('b', ['src/b']);
  const c = layer('c', ['src/c']);
  const g = layerGraph('app', [edge(a, [b, c]), edge(b, c)]);
  expect(g.edges).toHaveLength(3);
  expect(g.layers.map((l) => l.name)).toEqual(['a', 'b', 'c']);
  expect(() => layerGraph('app', [edge(a, [b, c]), edge(a, b)])).toThrow(
    /duplicate edge/,
  );
});

test('layerGraph() with empty name throws', () => {
  const a = layer('a', ['src/a']);
  const b = layer('b', ['src/b']);
  expect(() => layerGraph('', [edge(a, b)])).toThrow(/empty/);
});

test('layerGraph() with no edges throws', () => {
  expect(() => layerGraph('app', [])).toThrow(/at least 1 edge/);
});

test('layerGraph() with duplicate edge throws', () => {
  const a = layer('a', ['src/a']);
  const b = layer('b', ['src/b']);
  expect(() => layerGraph('app', [edge(a, b), edge(a, b)])).toThrow(
    /duplicate edge/,
  );
});

test('layerGraph() rejects same layer name with different definitions', () => {
  const a1 = layer('a', ['src/a']);
  const a2 = layer('a', ['src/other-a']);
  const b = layer('b', ['src/b']);
  expect(() => layerGraph('app', [edge(a1, b), edge(a2, b)])).toThrow(
    /duplicate layer name/,
  );
});

test('module() with rules passes them through', () => {
  const m = module('src/db', { rules: { onlyImportedBy: ['src/api'] } });
  expect(m.rules).toEqual({ onlyImportedBy: ['src/api'] });
});

test('module() rejects root combined with onlyImportedBy', () => {
  expect(() =>
    module('src/db', { rules: { root: true, onlyImportedBy: ['src/api'] } }),
  ).toThrow(/"root" contradicts "onlyImportedBy"/);
});

test('module() rejects leaf combined with onlyImports', () => {
  expect(() =>
    module('src/db', { rules: { leaf: true, onlyImports: ['src/api'] } }),
  ).toThrow(/"leaf" contradicts "onlyImports"/);
});
