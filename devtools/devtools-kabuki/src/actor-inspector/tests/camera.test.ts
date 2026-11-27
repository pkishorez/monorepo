import { describe, expect, it } from 'vitest';
import { centredOn } from '../view/shared/camera.ts';

const view = { width: 1000, height: 800 };

describe('centring a rect at the zoom the canvas has', () => {
  it('puts a rect that fits in the middle, keeping the zoom', () => {
    expect(
      centredOn({ x: 100, y: 200, width: 300, height: 200 }, view, 1),
    ).toEqual({ zoom: 1, x: 250, y: 100 });
    expect(
      centredOn({ x: 100, y: 200, width: 300, height: 200 }, view, 2),
    ).toEqual({ zoom: 2, x: 0, y: -200 });
  });

  it('puts the top of a rect taller than the stage at its top, with padding', () => {
    expect(
      centredOn({ x: 0, y: 500, width: 300, height: 1200 }, view, 1),
    ).toMatchObject({ y: 24 - 500 });
  });

  it('centres within what the overlays leave, and starts a tall rect below the top one', () => {
    const inset = { top: 40, bottom: 160 };
    expect(
      centredOn({ x: 0, y: 0, width: 300, height: 200 }, view, 1, inset),
    ).toMatchObject({ y: (40 + 640) / 2 - 100 });
    expect(
      centredOn({ x: 0, y: 100, width: 300, height: 700 }, view, 1, inset),
    ).toMatchObject({ y: 40 + 24 - 100 });
  });
});
