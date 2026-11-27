export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface Inset {
  readonly top: number;
  readonly bottom: number;
}

const SMALL = 600;

export const centredOn = (
  rect: Rect,
  view: { readonly width: number; readonly height: number },
  zoom: number,
  inset: Inset = { top: 0, bottom: 0 },
): Camera => {
  const small = view.width < SMALL;
  const margin = small ? 16 : 72;
  const pad = small ? 12 : 24;
  const axis = (
    start: number,
    length: number,
    from: number,
    to: number,
    edge: number,
  ) =>
    length * zoom > to - from - edge * 2
      ? from + edge - start * zoom
      : (from + to) / 2 - (start + length / 2) * zoom;
  return {
    zoom,
    x: axis(rect.x, rect.width, 0, view.width, margin),
    y: axis(rect.y, rect.height, inset.top, view.height - inset.bottom, pad),
  };
};
