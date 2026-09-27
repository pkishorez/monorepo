// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGestureEngine } from '../engine';
import type { Environment } from '../environment';
import { recognizersFor, type GestureEvent } from '../recognizers';
import { bindPointers } from './bind';
import { edgeStrips } from './edges';
import { contains, zoneRect } from './geometry';

const env = (
  platform: Environment['platform'],
  display: Environment['display'],
): Environment => ({
  platform,
  display,
  viewport: platform === 'desktop' ? 'wide' : 'compact',
  reducedMotion: false,
});

describe('edgeStrips', () => {
  it.each([
    ['iOS Safari tab', env('ios', 'tab'), 'browser', 24],
    ['iOS installed', env('ios', 'installed'), 'app', 24],
    ['Android tab', env('android', 'tab'), 'os', 32],
    ['Android installed', env('android', 'installed'), 'os', 32],
    ['desktop tab', env('desktop', 'tab'), 'browser', 24],
  ] as const)('%s: both edges belong to the %s, %ipx', (_, e, owner, width) => {
    expect(edgeStrips(e)).toEqual({
      left: { owner, width },
      right: { owner, width },
    });
  });
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

describe('bindPointers', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  const setup = () => {
    const element = document.createElement('div');
    document.body.append(element);
    const events: Array<GestureEvent> = [];
    const engine = createGestureEngine({
      recognizers: recognizersFor(['tap', 'pan']),
      width: () => 400,
      onGesture: (event) => events.push(event),
    });
    const unbind = bindPointers(element, engine, (x) => x >= 24);
    const names = () => events.map((event) => `${event.kind}:${event.phase}`);
    return { element, engine, names, unbind };
  };

  it('recognizes pointers that go down in the zone', () => {
    const { element, names } = setup();
    element.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointerup', 100, 50));
    expect(names()).toEqual(['tap:ended']);
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
    expect(names()).toEqual(['pan:began', 'pan:cancelled']);
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
    const { element, names } = setup();
    const input = document.createElement('input');
    element.append(input);
    input.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointerup', 100, 50));
    expect(names()).toEqual([]);
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
    const { element, names } = setup();
    const cell = sidewaysRow(element, 300);
    cell.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointerup', 100, 50));
    expect(names()).toEqual(['tap:ended']);
  });

  it('leaves a touch under an explicit sideways touch-action to the browser', () => {
    const { element, names } = setup();
    const strip = document.createElement('div');
    strip.style.setProperty('touch-action', 'pan-x');
    element.append(strip);
    strip.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointerup', 100, 50));
    expect(names()).toEqual([]);
  });

  it('holds back touch moves only once a recognizer claims', () => {
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

  it('resolves holds with a scheduled tick', () => {
    vi.useFakeTimers();
    try {
      const { element, engine } = setup();
      element.dispatchEvent(pointer('pointerdown', 100, performance.now()));
      expect(engine.inspect().states.find((s) => s.kind === 'tap')?.state).toBe(
        'possible',
      );
      vi.advanceTimersByTime(400);
      expect(engine.inspect().states.find((s) => s.kind === 'tap')?.state).toBe(
        'failed',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels what is under way when unbound', () => {
    const { element, names, unbind } = setup();
    element.dispatchEvent(pointer('pointerdown', 100, 0));
    window.dispatchEvent(pointer('pointermove', 140, 16));
    unbind();
    expect(names()).toEqual(['pan:began', 'pan:cancelled']);
  });
});
