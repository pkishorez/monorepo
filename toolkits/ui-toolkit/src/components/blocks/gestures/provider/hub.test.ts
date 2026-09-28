// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Environment } from '../../environment';
import { createHub, type Hub, runHub } from './hub';

const environment: Environment = {
  platform: 'desktop',
  display: 'tab',
  viewport: 'wide',
  reducedMotion: true,
};
const cleanups: Array<() => void> = [];
let time = 0;
const zone = (parent?: { hub: Hub; element: HTMLElement }) => {
  const hub = createHub({ parent: parent?.hub, scroll: 'none', environment });
  const element = document.createElement('div');
  element.dataset.slot = 'gesture-zone';
  element.getBoundingClientRect = () => new DOMRect(30, 50, 500, 500);
  (parent?.element ?? document.body).append(element);
  hub.element = element;
  const stop = runHub(hub, element);
  cleanups.unshift(stop);
  return { hub, element, stop };
};
const pointer = (
  element: HTMLElement,
  type: string,
  id: number,
  x: number,
  t: number,
) => {
  vi.advanceTimersByTime(t - time);
  time = t;
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: 100,
    button: 0,
  });
  for (const [key, value] of Object.entries({
    pointerId: id,
    pointerType: 'touch',
    timeStamp: t,
  })) {
    Object.defineProperty(event, key, { value });
  }
  element.dispatchEvent(event);
};
const hold = (element: HTMLElement, id: number, t: number) => {
  pointer(element, 'pointerdown', id, 80, t);
  pointer(element, 'pointerdown', id + 1, 200, t + 400);
  pointer(element, 'pointerup', id + 1, 200, t + 450);
};

beforeEach(() => {
  vi.useFakeTimers();
  time = 0;
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('nested hold ownership', () => {
  it('does not clear another child hold when an unrelated sibling unmounts', () => {
    const root = zone();
    const a = zone(root);
    const b = zone(root);
    hold(a.element, 1, 0);
    const held = a.hub.hold.get();
    expect(held?.side).toBe('left');
    expect(root.hub.hold.get()).toEqual(held);
    b.stop();
    expect(root.hub.hold.get()).toEqual(held);
    pointer(a.element, 'pointerup', 1, 80, 500);
    expect(root.hub.hold.get()).toBeUndefined();
  });

  it('restores the remaining hold when a different child releases', () => {
    const root = zone();
    const a = zone(root);
    const b = zone(root);
    hold(a.element, 1, 0);
    const first = a.hub.hold.get();
    hold(b.element, 3, 500);
    expect(root.hub.holds.size).toBe(2);
    pointer(b.element, 'pointerup', 3, 80, 1000);
    expect(root.hub.hold.get()).toEqual(first);
    expect(root.hub.holds.size).toBe(1);
    a.stop();
    expect(root.hub.hold.get()).toBeUndefined();
    expect(root.hub.holds.size).toBe(0);
  });

  it('keeps fingers local while routing an unhandled gesture to a parent hook', () => {
    const root = zone();
    const a = zone(root);
    const b = zone(root);
    hold(a.element, 1, 0);
    const tapped = vi.fn();
    root.hub.registry.add({
      gesture: 'tap',
      fingers: 1,
      hold: 'none',
      enabled: () => true,
      handle: tapped,
    });
    pointer(b.element, 'pointerdown', 3, 200, 500);
    pointer(b.element, 'pointerup', 3, 200, 550);
    expect(tapped).toHaveBeenCalledOnce();
    expect(tapped.mock.calls[0][0].hold).toBeUndefined();
    expect(a.hub.hold.get()?.side).toBe('left');
    expect(b.hub.hold.get()).toBeUndefined();
  });
});
