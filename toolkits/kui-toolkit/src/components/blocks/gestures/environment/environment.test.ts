import { describe, expect, it } from 'vitest';
import { createEnvironmentStore, readEnvironment } from './environment';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** A window with just what detection reads; `media` holds the queries that match. */
const fakeWindow = (options: {
  readonly userAgent: string;
  readonly maxTouchPoints?: number;
  readonly standalone?: boolean;
  readonly media?: ReadonlyArray<string>;
}) => {
  const media = new Set(options.media ?? []);
  const queries = new Map<string, EventTarget>();
  const win = {
    navigator: {
      userAgent: options.userAgent,
      maxTouchPoints: options.maxTouchPoints ?? 0,
      standalone: options.standalone,
    },
    matchMedia: (query: string) => {
      let list = queries.get(query);
      if (list === undefined) {
        list = Object.defineProperty(new EventTarget(), 'matches', {
          get: () => media.has(query),
        });
        queries.set(query, list);
      }
      return list;
    },
  };
  const setMedia = (query: string, on: boolean) => {
    if (on) media.add(query);
    else media.delete(query);
    queries.get(query)?.dispatchEvent(new Event('change'));
  };
  return { win: win as unknown as Window, setMedia };
};

describe('readEnvironment', () => {
  it('reads an iPhone in a Safari tab', () => {
    const { win } = fakeWindow({ userAgent: IPHONE, maxTouchPoints: 5 });
    expect(readEnvironment(win)).toEqual({
      platform: 'ios',
      display: 'tab',
      viewport: 'compact',
      reducedMotion: false,
    });
  });

  it('reads an iPhone home-screen app, old (navigator.standalone) and new (display-mode)', () => {
    const old = fakeWindow({ userAgent: IPHONE, standalone: true });
    const current = fakeWindow({
      userAgent: IPHONE,
      media: ['(display-mode: standalone)'],
    });
    expect(readEnvironment(old.win).display).toBe('installed');
    expect(readEnvironment(current.win).display).toBe('installed');
  });

  it('reads an iPad that reports a Mac user agent as iOS', () => {
    const { win } = fakeWindow({
      userAgent: IPAD_AS_MAC,
      maxTouchPoints: 5,
      media: ['(min-width: 768px)'],
    });
    expect(readEnvironment(win)).toMatchObject({
      platform: 'ios',
      viewport: 'wide',
    });
  });

  it('reads Android, installed in fullscreen', () => {
    const { win } = fakeWindow({
      userAgent: ANDROID,
      media: ['(display-mode: fullscreen)'],
    });
    expect(readEnvironment(win)).toMatchObject({
      platform: 'android',
      display: 'installed',
    });
  });

  it('reads a wide desktop browser with reduced motion', () => {
    const { win } = fakeWindow({
      userAgent: DESKTOP_CHROME,
      media: ['(prefers-reduced-motion: reduce)', '(min-width: 768px)'],
    });
    expect(readEnvironment(win)).toEqual({
      platform: 'desktop',
      display: 'tab',
      viewport: 'wide',
      reducedMotion: true,
    });
  });
});

describe('createEnvironmentStore', () => {
  it('keeps one snapshot until a watched query changes', () => {
    const { win, setMedia } = fakeWindow({ userAgent: IPHONE });
    const store = createEnvironmentStore(win);
    let notified = 0;
    const stop = store.subscribe(() => notified++);
    const first = store.get();
    expect(store.get()).toBe(first);

    setMedia('(display-mode: standalone)', true);
    expect(notified).toBe(1);
    expect(store.get()).not.toBe(first);
    expect(store.get().display).toBe('installed');

    setMedia('(min-width: 768px)', true);
    expect(notified).toBe(2);
    expect(store.get().viewport).toBe('wide');

    stop();
    setMedia('(prefers-reduced-motion: reduce)', true);
    expect(notified).toBe(2);
  });

  it('picks up changes made while nobody was subscribed', () => {
    const { win, setMedia } = fakeWindow({ userAgent: ANDROID });
    const store = createEnvironmentStore(win);
    setMedia('(display-mode: standalone)', true);
    expect(store.get().display).toBe('tab');
    store.subscribe(() => {})();
    expect(store.get().display).toBe('installed');
  });
});
