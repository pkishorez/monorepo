import { describe, expect, it } from 'vitest';
import { color, defineEffect, hexToRgb, num } from '../index.ts';

describe('defineEffect', () => {
  const glow = defineEffect({
    name: 'Glow',
    params: { amount: num(0.5, 0, 1), tint: color('#ff8000') },
    glsl: 'vec4 effect(vec2 uv) { return source(uv) * p.amount; }',
  });

  it('gives every param its default', () => {
    expect(glow().values).toEqual({ amount: 0.5, tint: '#ff8000' });
    expect(glow.definition.defaults).toEqual({ amount: 0.5, tint: '#ff8000' });
  });

  it('lets an instance change some params and keep the rest', () => {
    expect(glow({ amount: 0.9 }).values).toEqual({
      amount: 0.9,
      tint: '#ff8000',
    });
  });

  it('shares one definition between instances, unique per effect', () => {
    const other = defineEffect({ name: 'Other', params: {}, glsl: '' });
    expect(glow({ amount: 1 }).definition).toBe(glow().definition);
    expect(other.definition.id).not.toBe(glow.definition.id);
  });
});

describe('num', () => {
  it('steps a hundredth of its range unless told', () => {
    expect(num(5, 0, 10).step).toBe(0.1);
    expect(num(5, 0, 10, 1).step).toBe(1);
  });
});

describe('hexToRgb', () => {
  it('reads #rrggbb and #rgb as 0..1', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(hexToRgb('#fff')).toEqual([1, 1, 1]);
  });
});
