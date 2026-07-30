import { describe, expect, it } from 'vitest';

import { constrainViewport, interpolateCenter } from './viewport';

describe('constrainViewport', () => {
  it('keeps zoomed-out viewports pannable within the visible ratio', () => {
    const fit = { x: 0, y: 0, width: 100, height: 100 };
    const viewport = { x: -100, y: -100, width: 200, height: 200 };

    expect(constrainViewport(viewport, fit, 0.9)).toEqual(viewport);
    expect(
      constrainViewport({ ...viewport, x: -200, y: -200 }, fit, 0.9),
    ).toEqual({ ...viewport, x: -100, y: -100 });
  });

  it('keeps the full diagram visible vertically when zoomed out', () => {
    const fit = { x: 0, y: 0, width: 100, height: 100 };
    const viewport = { x: -50, y: -250, width: 200, height: 300 };

    expect(constrainViewport(viewport, fit, 0.9)).toEqual({
      ...viewport,
      y: -200,
    });
  });
});

describe('interpolateCenter', () => {
  it('eases followed node movement between positions', () => {
    expect(interpolateCenter({ x: 0, y: 0 }, { x: 100, y: 50 }, 0.5)).toEqual({
      x: 87.5,
      y: 43.75,
    });
  });
});
