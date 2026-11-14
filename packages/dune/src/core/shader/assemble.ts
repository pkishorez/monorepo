import type { EffectDefinition } from '../effect/define/index.ts';
import { COLOUR } from './colour.glsl.ts';
import { INPUTS } from './inputs.glsl.ts';
import { NOISE } from './noise.glsl.ts';
import { READ } from './read.glsl.ts';
import { SHAPES } from './shapes.glsl.ts';

/*
 * An effect is written as one function; here it becomes whole fragment
 * shaders: the prelude, its params as a struct `p`, its code, and a main()
 * that calls it. One shader per stage it has.
 */

const PRELUDE = `${INPUTS}${READ}${COLOUR}${NOISE}${SHAPES}
in vec2 v_uv;
out vec4 fragColor;
`;

const paramsBlock = (definition: EffectDefinition): string => {
  const fields = Object.entries(definition.params).map(
    ([key, param]) => `  ${param.kind === 'color' ? 'vec3' : 'float'} ${key};`,
  );
  // GLSL rejects an empty struct.
  if (fields.length === 0) fields.push('  float _unused;');
  return `struct Params {\n${fields.join('\n')}\n};\nuniform Params p;\n`;
};

const shader = (
  definition: EffectDefinition,
  code: string | undefined,
  entry: string,
): string =>
  `${PRELUDE}\n${paramsBlock(definition)}\n${code ?? ''}\n` +
  `void main() { fragColor = ${entry}(v_uv); }\n`;

/** The fragment shader that draws an effect, every frame it is drawn. */
export const effectShader = (definition: EffectDefinition): string =>
  shader(definition, definition.glsl, 'effect');

/** The fragment shader that steps an effect's memory, if it has one. */
export const memoryShader = (definition: EffectDefinition): string =>
  shader(definition, definition.memory, 'update');

/** The fragment shader that runs an effect's prepare(), if it has one. */
export const prepareShader = (definition: EffectDefinition): string =>
  shader(definition, definition.prepare, 'prepare');

/** Draws the input untouched: what an empty list of effects means. */
export const PASSTHROUGH = /* glsl */ `vec4 effect(vec2 uv) { return source(uv); }`;

/**
 * Whether an effect changes with time, and so must be drawn every frame.
 * The rest are drawn only when something they read changes.
 */
export const isAnimated = (definition: EffectDefinition): boolean =>
  definition.memory !== undefined || /\bu_(time|delta)\b/.test(definition.glsl);
