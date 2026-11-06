/*
 * The GLSL every effect is written in: the inputs the engine sets, and
 * helpers for reading the HTML, colour, noise and shapes, put together
 * with an effect's own code into whole shaders.
 */
export {
  PASSTHROUGH,
  effectShader,
  isAnimated,
  memoryShader,
  prepareShader,
} from './assemble.ts';
export { MAX_CLICKS, MAX_LAMPS } from './inputs.glsl.ts';
