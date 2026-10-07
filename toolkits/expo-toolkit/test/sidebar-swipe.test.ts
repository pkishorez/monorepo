import { createGestureProvider, thumbLock } from '@kstackz/use-gesture';
import { describe, expect, it } from 'vitest';
import { createFeed } from '../src/input/feed';
import { nativeScroll } from '../src/input/native-scroll';
import { createZones } from '../src/input/zones';
import { turns } from '../src/patterns/pages/turns';
import { sidebarSwipe } from '../src/patterns/sidebar/swipe';
import { phone } from './phone';

const CENTRE = { x: 200, y: 400 };

// A row of pills 400 points wide holding 700, scrolled `offset` from its start.
const pills = (offset: number) =>
  nativeScroll(true, () => ({ offset, size: 400, content: 700 }));

// The Sidebar's swipe in the surface's own zone, logging what it does.
const sidebar = (touch: ReturnType<typeof phone>) => {
  const log: Array<string> = [];
  const moves: Array<number> = [];
  let now = 0;
  touch.listen(
    sidebarSwipe({
      enabled: () => true,
      onMove: (offset) => moves.push(offset),
      onEnd: (open) => log.push(open ? 'open' : 'shut'),
      claim: () => log.push('claim'),
      clock: () => (now += 200),
    }),
  );
  return { log, moves };
};

// One finger from `from`, by (dx, dy), landing inside `inside`.
const swipe = (
  touch: ReturnType<typeof phone>,
  from: { x: number; y: number },
  by: { dx: number; dy: number },
  inside: Parameters<ReturnType<typeof phone>['down']>[3] = [],
) => {
  touch.down(1, from.x, from.y, inside);
  touch.slide(1, from, by);
  touch.up(1, from.x + by.dx, from.y + by.dy);
};

describe('Sidebar swipe on a phone', () => {
  it('opens under the finger on a swipe right from the middle', () => {
    const touch = phone();
    const { log, moves } = sidebar(touch);
    swipe(touch, CENTRE, { dx: 120, dy: 4 });
    // Claimed once its Direction is right, not as it lands.
    expect(log).toEqual(['claim', 'open']);
    expect(moves.at(-1)).toBe(120);
    expect(moves).toEqual([...moves].sort((a, b) => a - b));
  });

  it('claims a swipe from the left edge as the finger lands', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    touch.down(1, 8, 400);
    expect(log).toEqual(['claim']);
    touch.slide(1, { x: 8, y: 400 }, { dx: 120, dy: 4 });
    touch.up(1, 128, 404);
    expect(log).toEqual(['claim', 'open']);
  });

  it('springs back shut for a short swipe', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    touch.down(1, CENTRE.x, CENTRE.y);
    touch.slide(1, CENTRE, { dx: 30, dy: 0 }, 3);
    touch.up(1, CENTRE.x + 30, CENTRE.y);
    expect(log).toEqual(['claim', 'shut']);
  });

  it('leaves a scroll up or down, and a swipe left, alone', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    swipe(touch, CENTRE, { dx: 20, dy: 150 });
    swipe(touch, CENTRE, { dx: -10, dy: -150 });
    swipe(touch, CENTRE, { dx: -150, dy: 0 });
    expect(log).toEqual([]);
  });

  it('leaves a swipe right to Pages past their first', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    const pages = turns();
    pages.at(1, 1);
    const zone = touch.zone();
    touch.listen(pages.listener, zone);
    swipe(touch, CENTRE, { dx: 150, dy: 0 }, [zone]);
    expect(log).toEqual([]);
  });

  it('opens from the first of some Pages, which only turn left', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    const pages = turns();
    pages.at(0, 1);
    const zone = touch.zone();
    touch.listen(pages.listener, zone);
    swipe(touch, CENTRE, { dx: 150, dy: 0 }, [zone]);
    expect(log).toEqual(['claim', 'open']);
  });

  it('opens from the edge over Pages that want a swipe right', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    const pages = turns();
    pages.at(1, 1);
    const zone = touch.zone();
    touch.listen(pages.listener, zone);
    swipe(touch, { x: 8, y: 400 }, { dx: 150, dy: 0 }, [zone]);
    expect(log).toEqual(['claim', 'open']);
  });

  it('leaves a row of pills its swipe right once scrolled from its start', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    const zone = touch.zone();
    touch.listen(pills(120), zone);
    swipe(touch, CENTRE, { dx: 100, dy: 0 }, [zone]);
    expect(log).toEqual([]);
  });

  it('opens from a row of pills at its start', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    const zone = touch.zone();
    touch.listen(pills(0), zone);
    swipe(touch, CENTRE, { dx: 150, dy: 0 }, [zone]);
    expect(log).toEqual(['claim', 'open']);
  });

  it('finds the innermost zone: pills on a page past the first', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    const pages = turns();
    pages.at(1, 1);
    // Who drops each swipe: a listener that acts drops what another takes.
    const dropped: Array<string> = [];
    const named = (
      name: string,
      listener: typeof pages.listener,
    ): typeof pages.listener => ({
      ...listener,
      end: (pointers, end) => {
        if (end.interrupted) dropped.push(name);
        listener.end(pointers, end);
      },
    });
    const page = touch.zone();
    touch.listen(named('pages', pages.listener), page);
    const row = touch.zone(page);
    touch.listen(named('pills', pills(0)), row);
    // At their start the pills do not want a swipe right; the Pages do.
    swipe(touch, CENTRE, { dx: 150, dy: 0 }, [row, page]);
    expect(dropped).toEqual(['pills']);
    // Left, the pills can scroll, and keep it from the Pages around them.
    swipe(touch, CENTRE, { dx: -150, dy: 0 }, [page, row]);
    expect(dropped).toEqual(['pills', 'pages']);
    expect(log).toEqual([]);
  });

  it('leaves a Thumb Lock to the others, even over Pages', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    const pages = turns();
    pages.at(1, 1);
    const zone = touch.zone();
    touch.listen(pages.listener, zone);
    const locks: Array<string> = [];
    touch.listen(
      thumbLock({
        enabled: () => true,
        width: () => 400,
        onLock: () => locks.push('lock'),
        onMove: () => {},
        onEnd: (lifted) => locks.push(lifted ? 'lifted' : 'off'),
      }),
    );
    touch.down(1, 40, 700, [zone]);
    touch.down(2, 300, 400, [zone]);
    touch.slide(2, { x: 300, y: 400 }, { dx: 120, dy: 0 });
    touch.up(2, 420, 400);
    touch.up(1, 40, 700);
    expect(locks).toEqual(['lock', 'lifted']);
    expect(log).toEqual([]);
  });

  it('springs back shut when a second finger lands', () => {
    const touch = phone();
    const { log } = sidebar(touch);
    touch.down(1, CENTRE.x, CENTRE.y);
    touch.slide(1, CENTRE, { dx: 60, dy: 0 });
    touch.down(2, 300, 600);
    touch.up(2, 300, 600);
    touch.up(1, CENTRE.x + 60, CENTRE.y);
    expect(log).toEqual(['claim', 'shut']);
  });
});

describe('the surface feed on a phone', () => {
  it('waits for a zone that tells its landing after the surface does', () => {
    const zones = createZones();
    const provider = createGestureProvider(zones.tree);
    provider.addZone(zones.root);
    const pages = zones.inside(zones.root);
    provider.addZone(pages);
    const heard: Array<string> = [];
    provider.addGesture(pages, {
      enabled: () => true,
      start: () => heard.push('pages'),
      pointer: () => {},
      end: () => {},
    });
    let pending: (() => void) | undefined;
    const feed = createFeed(
      provider.sink,
      () => 0,
      (run) => (pending = run),
    );
    const at = { id: 0, absoluteX: 200, absoluteY: 400 };
    // Gesture Handler told the surface first, then the zone.
    feed.down({ changedTouches: [at] });
    feed.move({ changedTouches: [{ ...at, absoluteX: 230 }] });
    zones.land(pages, [{ x: 200, y: 400 }]);
    expect(heard).toEqual([]);
    pending?.();
    expect(heard).toEqual(['pages']);
    expect(provider.sink.direction()).toBe('right');
  });
});
