/*
 * The browser can't see what a shader did with the HTML, so it is told
 * where the HTML ended up: then clicks, focus and selection land on the
 * real elements.
 */

type DrawableCanvas = HTMLCanvasElement & {
  requestPaint?(): void;
  updateElementGeometry?(
    element: Element,
    geometry: { canvasTransform: DOMMatrix },
  ): void;
};

/**
 * Tells the browser where the element is drawn. It fills the canvas
 * untransformed, so the transform is the identity, in CSS pixels.
 */
export const place = (canvas: HTMLCanvasElement, element: Element): void => {
  (canvas as DrawableCanvas).updateElementGeometry?.(element, {
    canvasTransform: new DOMMatrix(),
  });
};

/** Asks for one `paint` event, so a snapshot exists at the size now. */
export const requestPaint = (canvas: HTMLCanvasElement): void => {
  (canvas as DrawableCanvas).requestPaint?.();
};
