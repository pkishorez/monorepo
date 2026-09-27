import { describe, expect, it } from 'vitest';
import {
  ANDROID_EDGE_STRIP_PX,
  EDGE_STRIP_PX,
  type Environment,
} from '../environment';
import { opensFrom, sidebarGestures } from './app-frame';

const environment = (
  platform: Environment['platform'],
  display: Environment['display'],
  viewport: Environment['viewport'] = platform === 'desktop'
    ? 'wide'
    : 'compact',
): Environment => ({ platform, display, viewport, reducedMotion: false });

describe('sidebarGestures', () => {
  it.each([
    ['iOS Safari tab', environment('ios', 'tab'), 'none', 'none'],
    ['iOS installed', environment('ios', 'installed'), 'edge-swipe', 'swipe'],
    ['Android tab', environment('android', 'tab'), 'none', 'none'],
    [
      'Android installed',
      environment('android', 'installed'),
      'inner-swipe',
      'swipe',
    ],
    ['desktop tab', environment('desktop', 'tab'), 'none', 'none'],
    ['desktop installed', environment('desktop', 'installed'), 'none', 'none'],
    [
      'desktop narrowed to a phone width',
      environment('desktop', 'installed', 'compact'),
      'none',
      'none',
    ],
    [
      'iPad installed, wide',
      environment('ios', 'installed', 'wide'),
      'none',
      'none',
    ],
    [
      'Android tablet installed, wide',
      environment('android', 'installed', 'wide'),
      'none',
      'none',
    ],
  ] as const)('%s: open %s, close %s', (_, env, open, close) => {
    expect(sidebarGestures(env)).toEqual({ open, close });
  });

  it('ignores reduced motion: a drag follows the finger either way', () => {
    expect(
      sidebarGestures({
        ...environment('ios', 'installed'),
        reducedMotion: true,
      }),
    ).toEqual({ open: 'edge-swipe', close: 'swipe' });
  });
});

describe('opensFrom', () => {
  const width = 390;

  it('edge swipe starts only inside the left edge zone', () => {
    expect(opensFrom('edge-swipe', 0, width)).toBe(true);
    expect(opensFrom('edge-swipe', EDGE_STRIP_PX, width)).toBe(true);
    expect(opensFrom('edge-swipe', EDGE_STRIP_PX + 1, width)).toBe(false);
    expect(opensFrom('edge-swipe', width - 4, width)).toBe(false);
  });

  it('inner swipe stays clear of both edges, where Android back lives', () => {
    expect(opensFrom('inner-swipe', 10, width)).toBe(false);
    expect(opensFrom('inner-swipe', ANDROID_EDGE_STRIP_PX - 1, width)).toBe(
      false,
    );
    expect(opensFrom('inner-swipe', ANDROID_EDGE_STRIP_PX, width)).toBe(true);
    expect(opensFrom('inner-swipe', 200, width)).toBe(true);
    expect(opensFrom('inner-swipe', width - ANDROID_EDGE_STRIP_PX, width)).toBe(
      true,
    );
    expect(opensFrom('inner-swipe', width - 10, width)).toBe(false);
  });

  it('never opens where no opening gesture is allowed', () => {
    expect(opensFrom('none', 0, width)).toBe(false);
    expect(opensFrom('none', 200, width)).toBe(false);
  });
});
