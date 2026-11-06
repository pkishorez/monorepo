/*
 * @kestack/dune: real, interactive HTML drawn into a canvas and lit by
 * shaders. Everything here works without React; `@kestack/dune/react`
 * wraps it in components.
 */
export {
  defineEffect,
  num,
  color,
  type ColorParam,
  type Effect,
  type EffectDefinition,
  type EffectInstance,
  type EffectSpec,
  type NumberParam,
  type Param,
  type ParamSpecs,
  type ParamValues,
} from './effect/define/index.ts';
export { lighting } from './effect/library/lighting/index.ts';
export {
  Engine,
  type EngineOptions,
  type Lamp,
  type Stats,
} from './engine/index.ts';
export {
  canvasAttributes,
  detect,
  drawableAttributes,
  type Api,
} from './platform/html-in-canvas/index.ts';
export { ShaderError } from './platform/webgl/index.ts';
