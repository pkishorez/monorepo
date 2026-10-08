import { describe, expect, it } from 'vitest';
import type { Recording } from 'laymos/story/schema';

import { captionHeight, screenGap, screenSizes } from './screen-size';

const recording = (
  deviceKind: Recording['deviceKind'],
  width: number,
  height: number,
): Recording => ({
  tab: deviceKind,
  device: deviceKind,
  deviceKind,
  viewport: { width, height },
  openedAt: 0,
  closedAt: 1,
  frames: [],
});

describe('screenSizes', () => {
  const tabs = [
    recording('desktop', 1280, 800),
    recording('desktop', 1280, 800),
  ];

  it('keeps every screen at its viewport aspect ratio', () => {
    for (const size of screenSizes(tabs, { width: 600, height: 500 })) {
      expect(size.width / size.height).toBeCloseTo(1280 / 800);
    }
  });

  it('scales the screens down together to fit side by side', () => {
    const sizes = screenSizes([...tabs, recording('mobile', 412, 839)], {
      width: 900,
      height: 800,
    });
    const across =
      sizes.reduce((sum, size) => sum + size.width, 0) +
      2 +
      2 +
      14 +
      2 * screenGap;
    expect(across).toBeCloseTo(900);
  });

  it('fills the height it is given when there is room across', () => {
    const [size] = screenSizes([recording('mobile', 412, 839)], {
      width: 5000,
      height: 700,
    });
    expect(size!.height).toBe(700 - 14 - captionHeight);
  });

  it('fits a desktop frame and a phone frame in the same height', () => {
    const sizes = screenSizes(
      [recording('desktop', 1280, 800), recording('mobile', 412, 839)],
      { width: 5000, height: 600 },
    );
    expect(sizes[0]!.height).toBe(sizes[1]!.height);
    expect(sizes[0]!.height + 26 + captionHeight).toBe(600);
  });
});
