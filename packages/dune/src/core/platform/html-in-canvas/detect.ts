/*
 * Chromium has shipped the HTML-in-Canvas API in two shapes:
 *
 * - current (Chrome 157+): `<canvas content="drawable">`, a `drawable`
 *   attribute on the drawn child, `gl.texElementSubImage2D(...)` into a
 *   texture allocated first, and `canvas.updateElementGeometry(...)` so
 *   clicks land.
 * - legacy (Chromium 147–156 behind `--enable-features=CanvasDrawElement`):
 *   `<canvas layoutsubtree>`, `gl.texElementImage2D(target, internalformat,
 *   element)`, and hit testing that already matches an untransformed child.
 */

/** Which shape of the API a browser has, if any. */
export type Api = 'current' | 'legacy' | 'none';

/** Which shape of the API this browser has, if any. */
export const detect = (): Api => {
  if (typeof WebGL2RenderingContext === 'undefined') return 'none';
  const gl = WebGL2RenderingContext.prototype;
  if ('texElementSubImage2D' in gl) return 'current';
  if ('texElementImage2D' in gl) return 'legacy';
  return 'none';
};

/**
 * The attributes a canvas needs to lay out and draw its child. Both, so
 * either API reads its own.
 */
export const canvasAttributes: Readonly<Record<string, string>> = {
  layoutsubtree: '',
  content: 'drawable',
};

/** The attribute the drawn child needs under the current API. */
export const drawableAttributes: Readonly<Record<string, string>> = {
  drawable: '',
};
