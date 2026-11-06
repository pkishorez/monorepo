/*
 * WebGL2 plumbing with no opinion about effects: programs, one fullscreen
 * triangle, textures and render targets.
 */
export {
  ShaderError,
  createProgram,
  createTriangle,
  type Program,
} from './program.ts';
export { createTexture } from './texture.ts';
export { createTarget, deleteTarget, type Target } from './target.ts';
