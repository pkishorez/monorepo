import { describe, expect, it } from 'vitest';

import {
  aimCamera,
  clampCamera,
  frameHeight,
  focusPadding,
  frameRect,
  maxHiddenShare,
  nudgeIntoView,
  nudgeTowardCentre,
  revealRect,
  zoomAt,
  zoomLimits,
  type Camera,
} from './camera';

const viewport = { width: 1000, height: 600 };

describe('clampCamera', () => {
  const big = { x: 0, y: 0, width: 3000, height: 2000 };
  const shown = 1 - maxHiddenShare;

  it('leaves a camera inside the bounds alone', () => {
    const camera = { x: -500, y: -300, zoom: 1 };
    expect(clampCamera(camera, big, viewport)).toEqual(camera);
  });

  it('lets all but a share of content bigger than the screen pan off', () => {
    // Panned right: the content's left 20% stays at the screen's right edge.
    expect(clampCamera({ x: 9000, y: 0, zoom: 1 }, big, viewport).x).toBe(
      1000 - 3000 * shown,
    );
    // Panned left: its right 20% stays at the screen's left edge.
    expect(clampCamera({ x: -9000, y: 0, zoom: 1 }, big, viewport).x).toBe(
      3000 * shown - 3000,
    );
    expect(clampCamera({ x: 0, y: 9000, zoom: 1 }, big, viewport).y).toBe(
      600 - 2000 * shown,
    );
  });

  it('keeps a share of the screen covered by content smaller than it', () => {
    const small = { x: 100, y: 50, width: 400, height: 300 };
    const right = clampCamera({ x: 9000, y: 9000, zoom: 1 }, small, viewport);
    // The near edge stops 20% of the screen short of its far edge.
    expect(right.x + 100).toBe(1000 - 1000 * shown);
    expect(right.y + 50).toBe(600 - 600 * shown);
    const left = clampCamera({ x: -9000, y: -9000, zoom: 1 }, small, viewport);
    expect(left.x + 500).toBe(1000 * shown);
    expect(left.y + 350).toBe(600 * shown);
  });

  it('keeps tiny content wholly on screen', () => {
    const tiny = { x: 0, y: 0, width: 50, height: 20 };
    const clamped = clampCamera({ x: 9000, y: -9000, zoom: 1 }, tiny, viewport);
    expect(clamped.x).toBe(1000 - 50);
    expect(clamped.y).toBe(0);
  });

  it('measures the share on screen at every zoom', () => {
    // At half zoom the big content is 1500 × 1000 on screen.
    const half = clampCamera({ x: 9000, y: -9000, zoom: 0.5 }, big, viewport);
    expect(half.x).toBe(1000 - 1500 * shown);
    expect(half.y).toBe(1000 * shown - 1000);
    // At a quarter it is 750 wide, smaller than the screen.
    const quarter = clampCamera({ x: 9000, y: 0, zoom: 0.25 }, big, viewport);
    expect(quarter.x).toBe(1000 - 1000 * shown);
    // At double zoom the content's 20% outgrows the screen: it fills it.
    const double = clampCamera({ x: 9000, y: 0, zoom: 2 }, big, viewport);
    expect(double.x).toBe(0);
  });

  it('holds zoom inside its limits', () => {
    expect(clampCamera({ x: 0, y: 0, zoom: 99 }, big, viewport).zoom).toBe(
      zoomLimits.max,
    );
  });
});

describe('frameRect', () => {
  it('centres the rect across, 40% of the way down, at the same zoom', () => {
    const rect = { x: 400, y: 200, width: 300, height: 200 };
    for (const zoom of [1, 0.5]) {
      const next = frameRect({ x: 10, y: 20, zoom }, rect, viewport);
      expect(next.zoom).toBe(zoom);
      expect((rect.x + rect.width / 2) * zoom + next.x).toBeCloseTo(500);
      expect((rect.y + rect.height / 2) * zoom + next.y).toBeCloseTo(
        600 * frameHeight,
      );
    }
  });

  it('sets the top of a rect too tall for that at the margin', () => {
    const rect = { x: 0, y: 100, width: 300, height: 900 };
    const next = frameRect({ x: 0, y: 0, zoom: 1 }, rect, viewport, 40);
    expect(rect.y + next.y).toBe(40);
    expect(150 + next.x).toBe(500);
  });

  it('sets the left of a rect wider than the screen at the margin', () => {
    const rect = { x: -200, y: 0, width: 1400, height: 100 };
    const next = frameRect({ x: 0, y: 0, zoom: 1 }, rect, viewport, 40);
    expect(rect.x + next.x).toBe(40);
    expect(50 + next.y).toBeCloseTo(600 * frameHeight);
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the cursor in place', () => {
    const camera: Camera = { x: 120, y: -40, zoom: 1 };
    const screen = { x: 400, y: 300 };
    const world = {
      x: (screen.x - camera.x) / camera.zoom,
      y: (screen.y - camera.y) / camera.zoom,
    };
    const next = zoomAt(camera, screen, 1.5);
    expect(world.x * next.zoom + next.x).toBeCloseTo(screen.x);
    expect(world.y * next.zoom + next.y).toBeCloseTo(screen.y);
  });
});

describe('nudgeIntoView', () => {
  const camera = { x: 0, y: 0, zoom: 1 };
  const card = (x: number, y: number) => ({ x, y, width: 200, height: 100 });

  it('leaves a card already inside the padding where it is', () => {
    expect(nudgeIntoView(camera, card(300, 200), viewport)).toEqual(camera);
    // Exactly on the padding still counts as inside.
    expect(nudgeIntoView(camera, card(700, 400), viewport)).toEqual(camera);
  });

  it('moves a card just past the padding a little', () => {
    // 20px past the right padding: brought in, then a quarter of the rest
    // of the way to the centre (its centre would sit at 800, the screen's at 500).
    const next = nudgeIntoView(camera, card(720, 200), viewport);
    expect(next.x).toBe(-20 + (500 - 800) * nudgeTowardCentre);
    expect(next.y).toBe(0);
    expect(Math.abs(next.x)).toBeLessThan(100);
  });

  it('brings an offscreen card in with a nudge towards the centre', () => {
    const next = nudgeIntoView(camera, card(-900, 1400), viewport);
    const left = -900 + next.x;
    const top = 1400 + next.y;
    // Inside the padding, a quarter of the way on towards the centre.
    expect(left).toBe(focusPadding + (500 - 200) * nudgeTowardCentre);
    expect(top).toBe(
      600 - focusPadding - 100 + (240 - 450) * nudgeTowardCentre,
    );
    expect(left).toBeGreaterThanOrEqual(focusPadding);
    expect(top + 100).toBeLessThanOrEqual(600 - focusPadding);
  });

  it('centres a card too big for the padding that still fits the screen', () => {
    const big = { x: 50, y: 50, width: 900, height: 500 };
    const next = nudgeIntoView({ x: -400, y: -300, zoom: 1 }, big, viewport);
    expect(50 + next.x).toBe(50);
    expect(50 + next.y).toBe(50);
  });

  it('keeps the top-left of a card bigger than the screen inside the padding', () => {
    const huge = { x: 50, y: 50, width: 1200, height: 700 };
    const next = nudgeIntoView({ x: -400, y: -300, zoom: 1 }, huge, viewport);
    expect(50 + next.x).toBe(focusPadding);
    expect(50 + next.y).toBe(focusPadding);
  });

  it('frames a card as wide as a phone less its margins with equal margins', () => {
    const phone = { width: 390, height: 844 };
    const card = { x: 700, y: 40, width: 350, height: 300 };
    const next = frameRect({ x: 0, y: 0, zoom: 1 }, card, phone);
    expect(700 + next.x).toBe(20);
  });
});

describe('aimCamera', () => {
  const bounds = { x: 0, y: 0, width: 2000, height: 1200 };
  const goal = { x: -100, y: -50, zoom: 1 };

  it('frames, nudges or opens on the rect it is given', () => {
    const rect = { x: 400, y: 300, width: 200, height: 100 };
    expect(aimCamera(goal, { kind: 'frame', rect }, bounds, viewport)).toEqual(
      frameRect(goal, rect, viewport),
    );
    expect(aimCamera(goal, { kind: 'nudge', rect }, bounds, viewport)).toEqual(
      goal,
    );
    const top = { x: 0, y: 0, width: 300, height: 140 };
    const opened = aimCamera(goal, { kind: 'open', top }, bounds, viewport);
    expect(opened.x + 150).toBe(500);
    expect(opened.y + 70).toBe(600 * frameHeight);
  });

  it('keeps a card that moved by `by` where it was on screen', () => {
    const kept = aimCamera(
      { x: -100, y: -50, zoom: 0.5 },
      { kind: 'keep', by: { x: 40, y: -80 } },
      bounds,
      viewport,
    );
    expect(kept).toEqual({ x: -120, y: -10, zoom: 0.5 });
  });

  it('holds the result inside the bounds', () => {
    const far = { x: 9000, y: 0, width: 10, height: 10 };
    expect(
      aimCamera(goal, { kind: 'frame', rect: far }, bounds, viewport),
    ).toEqual(clampCamera(frameRect(goal, far, viewport), bounds, viewport));
  });
});

describe('revealRect', () => {
  const viewport = { width: 1000, height: 800 };
  const camera = { zoom: 1, x: 0, y: 0 };

  it('stays put when the rect is already on screen with room', () => {
    expect(
      revealRect(camera, { x: 100, y: 100, width: 300, height: 200 }, viewport),
    ).toEqual(camera);
  });

  it('moves just far enough to bring a rect below the screen up', () => {
    const next = revealRect(
      camera,
      { x: 100, y: 700, width: 300, height: 200 },
      viewport,
    );
    expect(next).toEqual({ zoom: 1, x: 0, y: -150 });
  });

  it('zooms out, never in, when the rect is too big for the screen', () => {
    const next = revealRect(
      camera,
      { x: 0, y: 0, width: 1800, height: 400 },
      viewport,
    );
    expect(next.zoom).toBeCloseTo(0.5, 5);
    expect(
      revealRect(
        { zoom: 0.5, x: 0, y: 0 },
        { x: 10, y: 10, width: 10, height: 10 },
        viewport,
      ).zoom,
    ).toBe(0.5);
  });
});
