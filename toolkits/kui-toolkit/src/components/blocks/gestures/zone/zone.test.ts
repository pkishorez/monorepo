// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGestureEngine, type GestureEvent, type Policy } from '../engine';
import { edgeStrips, type Environment } from '../../environment';
import { bindPointers, ZONE_SELECTOR } from './bind';
import { contains, zoneRect } from './geometry';
import { scrollEnds } from './scrollers';
import { bindZone } from './zone';

const env = (
  platform: Environment['platform'],
  display: Environment['display'],
): Environment => ({
  platform,
  display,
  viewport: platform === 'desktop' ? 'wide' : 'compact',
  reducedMotion: false,
});

describe('zoneRect', () => {
  const strips = edgeStrips(env('ios', 'tab'));

  it('cuts the viewport edge strips out of a full-width element', () => {
    const rect = zoneRect(
      { left: 0, top: 50, right: 390, bottom: 2000 },
      390,
      strips,
    );
    expect(rect).toEqual({ left: 24, top: 50, right: 366, bottom: 2000 });
    expect(contains(rect, 10, 100)).toBe(false);
    expect(contains(rect, 24, 100)).toBe(true);
    expect(contains(rect, 200, 100)).toBe(true);
    expect(contains(rect, 380, 100)).toBe(false);
    expect(contains(rect, 200, 40)).toBe(false);
  });

  it('leaves an element well inside the viewport whole', () => {
    const bounds = { left: 100, top: 0, right: 600, bottom: 400 };
    expect(zoneRect(bounds, 1280, strips)).toEqual(bounds);
  });
});

// jsdom has no PointerEvent, so give mouse events the fields the binding reads.
const pointer = (
  type: string,
  x: number,
  t: number,
  fields: { readonly pointerId?: number; readonly pointerType?: string } = {},
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 100,
    button: 0,
  });
  for (const [key, value] of Object.entries({
    pointerId: fields.pointerId ?? 1,
    pointerType: fields.pointerType ?? 'touch',
    timeStamp: t,
  })) {
    Object.defineProperty(event, key, { value });
  }
  return event;
};

// Every movement pans; one-finger taps wait for a double tap.
const PANS: Policy = {
  movement: () => 'pan',
  pinch: () => true,
  doubleTap: (combination) => combination.fingers === 1,
};

describe('bindPointers', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  const setup = (parent: HTMLElement = document.body) => {
    const element = document.createElement('div');
    element.dataset.slot = 'gesture-zone';
    parent.append(element);
    const events: Array<GestureEvent> = [];
    const engine = createGestureEngine({
      scroll: 'none',
      policy: PANS,
      onGesture: (event) => events.push(event),
    });
    const unbind = bindPointers(element, engine, (event) =>
      event.clientX >= 24 ? { edge: undefined, ends: [] } : undefined,
    );
    const names = () =>
      events
        .filter((event) => event.kind !== 'touch')
        .map((event) =>
          'phase' in event ? `${event.kind}:${event.phase}` : event.kind,
        );
    return { element, engine, names, unbind };
  };

  it('recognizes pointers that go down in the zone', () => {
    const { element, engine } = setup();
    element.dispatchEvent(pointer('pointerdown', 100, 0));
    expect(engine.inspect().fingers).toHaveLength(1);
    window.dispatchEvent(pointer('pointerup', 100, 50));
    expect(engine.inspect().value).toBe('tapped');
  });

  it('leaves a touch in a nested Gesture Zone to that zone', () => {
    const outer = setup();
    const inner = setup(outer.element);
    const child = document.createElement('div');
    inner.element.append(child);
    child.dispatchEvent(pointer('pointerdown', 100, 0));
    expect(inner.engine.inspect().fingers).toHaveLength(1);
    expect(outer.engine.inspect().fingers).toEqual([]);
    expect(child.closest(ZONE_SELECTOR)).toBe(inner.element);
  });

  it('leaves pointers that go down in an edge strip to the platform', () => {
    const { element, engine, names } = setup();
    element.dispatchEvent(pointer('pointerdown', 10, 0));
    window.dispatchEvent(pointer('pointermove', 120, 16));
    window.dispatchEvent(pointer('pointerup', 120, 32));
    expect(names()).toEqual([]);
    expect(engine.inspect().fingers).toEqual([]);
  });

  it('cancels a gesture the browser takes with pointercancel', () => {
    const { element, names } = setup();
    element.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointermove', 140, 16));
    window.dispatchEvent(pointer('pointercancel', 140, 32));
    expect(names()).toEqual(['pan:start', 'pan:cancel']);
  });

  it('keeps the touch callout menu away, but not the mouse context menu', () => {
    const { element } = setup();
    const touch = pointer('contextmenu', 100, 0);
    element.dispatchEvent(touch);
    expect(touch.defaultPrevented).toBe(true);
    const mouse = pointer('contextmenu', 100, 0, { pointerType: 'mouse' });
    element.dispatchEvent(mouse);
    expect(mouse.defaultPrevented).toBe(false);
  });

  it('ignores text fields inside the zone', () => {
    const { element, engine } = setup();
    const input = document.createElement('input');
    element.append(input);
    input.dispatchEvent(pointer('pointerdown', 100, 0));
    expect(engine.inspect().fingers).toEqual([]);
  });

  /** A child of the zone that scrolls sideways when its content is wider than it. */
  const sidewaysRow = (element: HTMLElement, contentWidth: number) => {
    const row = document.createElement('div');
    row.style.overflowX = 'auto';
    Object.defineProperty(row, 'clientWidth', { value: 300 });
    Object.defineProperty(row, 'scrollWidth', { value: contentWidth });
    const cell = document.createElement('div');
    row.append(cell);
    element.append(row);
    return cell;
  };

  it('leaves a touch that starts in a native sideways scroller to it', () => {
    const { element, engine, names } = setup();
    const cell = sidewaysRow(element, 900);
    cell.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointermove', 160, 16));
    window.dispatchEvent(pointer('pointerup', 160, 32));
    expect(names()).toEqual([]);
    expect(engine.inspect().fingers).toEqual([]);
  });

  it('keeps a touch in an overflow box with nothing to scroll', () => {
    const { element, engine } = setup();
    const cell = sidewaysRow(element, 300);
    cell.dispatchEvent(pointer('pointerdown', 100, 0));
    expect(engine.inspect().fingers).toHaveLength(1);
  });

  it('leaves a touch under an explicit sideways touch-action to the browser', () => {
    const { element, engine } = setup();
    const strip = document.createElement('div');
    strip.style.setProperty('touch-action', 'pan-x');
    element.append(strip);
    strip.dispatchEvent(pointer('pointerdown', 100, 0));
    expect(engine.inspect().fingers).toEqual([]);
  });

  it('holds back touch moves only once the touch is Captured', () => {
    const { element } = setup();
    const touchmove = () => {
      const event = new Event('touchmove', { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    element.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointermove', 104, 8));
    expect(touchmove()).toBe(false);
    window.dispatchEvent(pointer('pointermove', 140, 16));
    expect(touchmove()).toBe(true);
    window.dispatchEvent(pointer('pointerup', 140, 32));
    expect(touchmove()).toBe(false);
  });

  it('swallows the click after a Captured touch, but not after a tap', async () => {
    // Earlier tests leave a swallow armed until the next task.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { element } = setup();
    const click = () => {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    element.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointerup', 100, 40));
    expect(click()).toBe(false);
    element.dispatchEvent(pointer('pointerdown', 100, 1000));
    window.dispatchEvent(pointer('pointermove', 160, 1016));
    window.dispatchEvent(pointer('pointerup', 160, 1032));
    expect(click()).toBe(true);
  });

  it('runs double-tap waits on the page timers', () => {
    vi.useFakeTimers();
    try {
      const { element, names } = setup();
      element.dispatchEvent(pointer('pointerdown', 100, 0));
      window.dispatchEvent(pointer('pointerup', 100, 40));
      expect(names()).toEqual([]);
      vi.advanceTimersByTime(400);
      expect(names()).toEqual(['tap']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels what is under way when unbound', () => {
    const { element, names, unbind } = setup();
    element.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointermove', 140, 16));
    unbind();
    expect(names()).toEqual(['pan:start', 'pan:cancel']);
  });
});

describe('scrollEnds', () => {
  const scroller = (scrollTop: number) => {
    const feed = document.createElement('div');
    feed.style.overflowY = 'auto';
    Object.defineProperty(feed, 'clientHeight', { value: 500 });
    Object.defineProperty(feed, 'scrollHeight', { value: 2000 });
    feed.scrollTop = scrollTop;
    const row = document.createElement('div');
    const cell = document.createElement('div');
    row.append(cell);
    feed.append(row);
    document.body.append(feed);
    return cell;
  };

  it('is down at the top of a feed, up at its bottom, and nothing in between', () => {
    expect(scrollEnds(scroller(0), 'y')).toEqual(['down']);
    expect(scrollEnds(scroller(1500), 'y')).toEqual(['up']);
    expect(scrollEnds(scroller(700), 'y')).toEqual([]);
  });

  it('is both ends with no scroller at all', () => {
    const lone = document.createElement('div');
    document.body.append(lone);
    expect(scrollEnds(lone, 'y')).toEqual(['up', 'down']);
    expect(scrollEnds(lone, 'x')).toEqual(['left', 'right']);
  });
});

describe('bindZone', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  const setup = (
    environment: Environment,
    wantsStrip: (side: 'left' | 'right') => boolean,
  ) => {
    const element = document.createElement('div');
    element.dataset.slot = 'gesture-zone';
    element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: window.innerWidth, bottom: 800 }) as DOMRect;
    document.body.append(element);
    const starts: Array<unknown> = [];
    const engine = createGestureEngine({
      scroll: 'none',
      policy: PANS,
      onGesture: () => {},
    });
    const feed = engine.feed;
    engine.feed = (input) => {
      if (input.type === 'down') starts.push(input.start);
      feed(input);
    };
    bindZone(element, engine, {
      environment: () => environment,
      scroll: 'none',
      wantsStrip,
    });
    return { element, starts };
  };

  it('listens in a strip the app owns when an edge Swipe wants it', () => {
    const { element, starts } = setup(
      env('ios', 'installed'),
      (side) => side === 'left',
    );
    element.dispatchEvent(pointer('pointerdown', 10, 0, { pointerId: 1 }));
    element.dispatchEvent(
      pointer('pointerdown', window.innerWidth - 10, 0, { pointerId: 2 }),
    );
    element.dispatchEvent(pointer('pointerdown', 200, 0, { pointerId: 3 }));
    expect(starts).toEqual([
      { edge: 'left', ends: [] },
      { edge: undefined, ends: [] },
    ]);
  });

  it('never listens in a strip the browser or OS owns', () => {
    const { element, starts } = setup(env('android', 'tab'), () => true);
    element.dispatchEvent(pointer('pointerdown', 10, 0));
    expect(starts).toEqual([]);
  });
});
