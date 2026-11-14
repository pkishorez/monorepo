import type { Api } from './detect.ts';

/*
 * The browser paints the canvas's child as it would any HTML, but keeps the
 * pixels to itself until asked: on each `paint` event, a fresh snapshot is
 * ready to copy into a texture. Both API shapes write the top row first, so
 * no flip is needed.
 */

type CurrentGl = WebGL2RenderingContext & {
  texElementSubImage2D(
    target: number,
    level: number,
    x: number,
    y: number,
    element: Element,
    options: { width: number; height: number },
  ): void;
};

type LegacyGl = WebGL2RenderingContext & {
  texElementImage2D(
    target: number,
    internalformat: number,
    element: Element,
  ): void;
};

/**
 * Sizes the bound texture for `upload`. Under the current API the texture
 * is allocated here once per size, so each upload only copies; under the
 * legacy API the upload allocates for itself.
 */
export const allocate = (
  gl: WebGL2RenderingContext,
  api: Api,
  width: number,
  height: number,
): void => {
  if (api !== 'current') return;
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
};

/**
 * Copies the element's latest snapshot into the bound texture, scaled to
 * `width` by `height` device pixels. Call it from the canvas's `paint`
 * event, when a fresh snapshot is ready.
 *
 * Its colours arrive premultiplied by alpha, as every effect reads them.
 * Left to WebGL's default, a DOM source comes in straight: opaque pixels
 * look the same either way, but anything see-through, a fading element or
 * the soft edge of a glyph, comes out too bright and off in hue.
 */
export const upload = (
  gl: WebGL2RenderingContext,
  api: Api,
  element: Element,
  width: number,
  height: number,
): void => {
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  try {
    copy(gl, api, element, width, height);
  } finally {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
};

const copy = (
  gl: WebGL2RenderingContext,
  api: Api,
  element: Element,
  width: number,
  height: number,
): void => {
  if (api === 'current')
    (gl as CurrentGl).texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, element, {
      width,
      height,
    });
  else if (api === 'legacy')
    (gl as LegacyGl).texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, element);
};
