import { createTexture } from './texture.ts';

/** A texture to draw into, and the framebuffer that does. */
export type Target = {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
};

/**
 * A render target. Precise ones are half floats where the GPU can draw
 * into them, so slow fades in an effect's memory don't stall at 8-bit
 * steps.
 */
export const createTarget = (
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  precise: boolean,
): Target => {
  const texture = createTexture(gl);
  const float = precise && gl.getExtension('EXT_color_buffer_float') !== null;
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    float ? gl.RGBA16F : gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
    null,
  );
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, width, height };
};

export const deleteTarget = (
  gl: WebGL2RenderingContext,
  target: Target,
): void => {
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.framebuffer);
};
