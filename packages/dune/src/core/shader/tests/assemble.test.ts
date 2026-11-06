import { describe, expect, it } from 'vitest';
import { defineEffect, num } from '../../effect/define/index.ts';
import {
  effectShader,
  isAnimated,
  memoryShader,
  prepareShader,
} from '../index.ts';

const still = defineEffect({
  name: 'Still',
  params: { amount: num(1, 0, 2) },
  glsl: 'vec4 effect(vec2 uv) { return source(uv) * p.amount; }',
  prepare: 'vec4 prepare(vec2 uv) { return html(uv); }',
});

describe('effectShader', () => {
  const source = effectShader(still.definition);

  it('starts with the version, then the prelude', () => {
    expect(source.startsWith('#version 300 es')).toBe(true);
    expect(source).toContain('vec4 html(vec2 uv)');
    expect(source).toContain('vec3 fitGamut(vec3 c)');
  });

  it('declares the params as the struct p', () => {
    expect(source).toContain('struct Params {\n  float amount;\n};');
    expect(source).toContain('uniform Params p;');
  });

  it('calls the effect from main', () => {
    expect(source).toContain('fragColor = effect(v_uv);');
  });

  it('gives an effect with no params a struct GLSL accepts', () => {
    const bare = defineEffect({ name: 'Bare', params: {}, glsl: '' });
    expect(effectShader(bare.definition)).toContain('float _unused;');
  });
});

describe('the other stages', () => {
  it('calls prepare() and update() from their own mains', () => {
    expect(prepareShader(still.definition)).toContain(
      'fragColor = prepare(v_uv);',
    );
    const trail = defineEffect({
      name: 'Trail',
      params: {},
      glsl: 'vec4 effect(vec2 uv) { return memory(uv); }',
      memory: 'vec4 update(vec2 uv) { return previous(uv) * 0.9; }',
    });
    expect(memoryShader(trail.definition)).toContain(
      'fragColor = update(v_uv);',
    );
  });
});

describe('isAnimated', () => {
  it('is false for an effect that reads neither time nor memory', () => {
    expect(isAnimated(still.definition)).toBe(false);
  });

  it('is true for one that reads time, or keeps memory', () => {
    const wave = defineEffect({
      name: 'Wave',
      params: {},
      glsl: 'vec4 effect(vec2 uv) { return source(uv + sin(u_time)); }',
    });
    const trail = defineEffect({
      name: 'Trail',
      params: {},
      glsl: '',
      memory: 'vec4 update(vec2 uv) { return previous(uv); }',
    });
    expect(isAnimated(wave.definition)).toBe(true);
    expect(isAnimated(trail.definition)).toBe(true);
  });
});
