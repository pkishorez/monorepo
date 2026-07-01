import { expect, test } from 'vitest';

import { feature, module } from '../src/index.js';

// ---------------------------------------------------------------------------
// module()
// ---------------------------------------------------------------------------

test('module() returns path and barrel:false by default', () => {
  const m = module('src/routes/orders');
  expect(m.path).toBe('src/routes/orders');
  expect(m.barrel).toBe(false);
});

test('module() with barrel:true sets barrel', () => {
  const m = module('src/routes/orders', { barrel: true });
  expect(m.barrel).toBe(true);
});

test('module() with barrel:false is explicit false', () => {
  const m = module('src/routes/orders', { barrel: false });
  expect(m.barrel).toBe(false);
});

test('module() with empty path throws', () => {
  expect(() => module('')).toThrow(/empty/);
});

// ---------------------------------------------------------------------------
// feature()
// ---------------------------------------------------------------------------

test('feature() returns correct shape', () => {
  const f = feature('orders', {
    root: 'routes::orders',
    modules: ['routes::orders', 'lib::format'],
  });
  expect(f.kind).toBe('feature');
  expect(f.name).toBe('orders');
  expect(f.root).toBe('routes::orders');
  expect(f.modules).toEqual(['routes::orders', 'lib::format']);
  expect(f.config).toEqual({});
});

test('feature() with description sets config.description', () => {
  const f = feature('orders', {
    root: 'a',
    modules: ['a', 'b'],
    description: 'The orders feature',
  });
  expect(f.config.description).toBe('The orders feature');
});

test('feature() with empty name throws', () => {
  expect(() => feature('', { root: 'a', modules: ['a'] })).toThrow(
    /name must not be empty/,
  );
});

test('feature() with root not in modules throws', () => {
  expect(() => feature('f', { root: 'z', modules: ['a', 'b'] })).toThrow(
    /root "z" must be present in modules/,
  );
});

test('feature() with root in modules succeeds', () => {
  const f = feature('f', { root: 'a', modules: ['a', 'b'] });
  expect(f.root).toBe('a');
});

test('feature() modules array is a copy (immutable-safe)', () => {
  const mods = ['a', 'b'];
  const f = feature('f', { root: 'a', modules: mods });
  mods.push('c');
  expect(f.modules).toEqual(['a', 'b']);
});
