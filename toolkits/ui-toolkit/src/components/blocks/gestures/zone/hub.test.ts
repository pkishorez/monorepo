import { describe, expect, it, vi } from 'vitest';
import type { Hold } from '../zone-machine';
import type { Axis } from '../swipe-reading';
import {
  createHub,
  type GestureListener,
  type PanListener,
  type SwipeListener,
  type TapListener,
} from './hub';

const at = (id: number, x: number, y: number, t = 0) => ({ id, x, y, t });

const gestureListener = (enabled = true, hold: Hold = false) =>
  ({
    enabled: () => enabled,
    hold: () => hold,
    begin: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
  }) satisfies GestureListener;

const swipeListener = (axis?: Axis, enabled = true, hold: Hold = false) =>
  ({
    enabled: () => enabled,
    hold: () => hold,
    axis: () => axis,
    begin: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
  }) satisfies SwipeListener;

const panListener = (enabled = true, hold: Hold = false) =>
  ({
    enabled: () => enabled,
    hold: () => hold,
    begin: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
  }) satisfies PanListener;

const tapListener = (hold: Hold = false) =>
  ({
    enabled: () => true,
    hold: () => hold,
    tap: vi.fn(),
  }) satisfies TapListener;

// The Hold Zone: within 100px of the bottom-left corner of a zone whose
// bottom is at y = 1000.
const inHoldZone = ({ x, y }: { x: number; y: number }) =>
  Math.hypot(x, y - 1000) <= 100;

const cornered = () => {
  const onHold = vi.fn();
  return { hub: createHub({ inHoldZone, onHold }), onHold };
};

describe('hub', () => {
  it('hands one Gesture to every enabled listener, first finger to last', () => {
    const hub = createHub();
    const on = gestureListener();
    const off = gestureListener(false);
    hub.addGesture(on);
    hub.addGesture(off);
    hub.sink.down(at(1, 0, 0));
    hub.sink.move(at(1, 20, 0));
    hub.sink.down(at(2, 100, 0));
    hub.sink.up(at(1, 20, 0));
    hub.sink.move(at(2, 110, 0));
    expect(on.finish).not.toHaveBeenCalled();
    hub.sink.up(at(2, 110, 0));
    expect(on.begin).toHaveBeenCalledTimes(1);
    expect(on.update).toHaveBeenLastCalledWith({
      x: 30,
      y: 0,
      scale: 1,
      rotation: 0,
    });
    expect(on.finish).toHaveBeenCalledTimes(1);
    expect(off.begin).not.toHaveBeenCalled();
  });

  it('gives a Swipe only to listeners on its axis', () => {
    const hub = createHub();
    const across = swipeListener('x');
    const upDown = swipeListener('y');
    const either = swipeListener();
    for (const listener of [across, upDown, either]) hub.addSwipe(listener);
    hub.sink.down(at(1, 0, 0));
    hub.sink.move(at(1, 0, 40));
    hub.sink.up(at(1, 0, 40));
    expect(across.begin).not.toHaveBeenCalled();
    expect(upDown.begin).toHaveBeenCalledWith('y');
    expect(either.update).toHaveBeenLastCalledWith('y', 40);
    expect(upDown.finish).toHaveBeenCalledWith(
      expect.objectContaining({ axis: 'y', distance: 40, interrupted: false }),
    );
  });

  it('interrupts a Swipe when a second finger lands, while the Gesture carries on', () => {
    const hub = createHub();
    const swipe = swipeListener();
    const gesture = gestureListener();
    hub.addSwipe(swipe);
    hub.addGesture(gesture);
    hub.sink.down(at(1, 0, 0));
    hub.sink.move(at(1, 30, 0));
    hub.sink.down(at(2, 200, 0));
    expect(swipe.finish).toHaveBeenCalledWith(
      expect.objectContaining({ interrupted: true, distance: 30 }),
    );
    expect(gesture.finish).not.toHaveBeenCalled();
    hub.sink.up(at(2, 200, 0));
    hub.sink.move(at(1, 90, 0));
    expect(swipe.begin).toHaveBeenCalledTimes(1);
  });

  it('ends the Gesture and its Swipe as interrupted when the touch is taken away', () => {
    const hub = createHub();
    const swipe = swipeListener();
    const gesture = gestureListener();
    hub.addSwipe(swipe);
    hub.addGesture(gesture);
    hub.sink.down(at(1, 0, 0));
    hub.sink.move(at(1, 60, 0));
    hub.sink.cancelAll();
    expect(swipe.finish).toHaveBeenCalledWith(
      expect.objectContaining({ interrupted: true, distance: 60 }),
    );
    expect(gesture.finish).toHaveBeenCalledWith(
      expect.objectContaining({ interrupted: true, x: 60 }),
    );
  });

  it('asks the release not to click once the Gesture moved', () => {
    const hub = createHub();
    hub.sink.down(at(1, 0, 0));
    expect(hub.sink.up(at(1, 0, 0))).toBe(false);
    hub.sink.down(at(1, 0, 0));
    hub.sink.move(at(1, 30, 0));
    expect(hub.sink.up(at(1, 30, 0))).toBe(true);
  });

  it('taps once for a still finger that lifts, and not after it moved', () => {
    const hub = createHub();
    const tap = tapListener();
    hub.addTap(tap);
    hub.sink.down(at(1, 10, 20));
    hub.sink.move(at(1, 13, 20));
    hub.sink.up(at(1, 13, 20));
    expect(tap.tap).toHaveBeenCalledWith({ point: { x: 10, y: 20 } });
    hub.sink.down(at(1, 0, 0));
    hub.sink.move(at(1, 30, 0));
    hub.sink.up(at(1, 30, 0));
    hub.sink.down(at(1, 0, 0));
    hub.sink.down(at(2, 5, 0));
    hub.sink.up(at(2, 5, 0));
    hub.sink.up(at(1, 0, 0));
    expect(tap.tap).toHaveBeenCalledTimes(1);
  });

  it('keeps the corner ordinary while no listener takes the Hold', () => {
    const { hub } = cornered();
    const plain = gestureListener();
    hub.addGesture(plain);
    hub.sink.down(at(1, 10, 990));
    hub.sink.down(at(2, 110, 990));
    hub.sink.move(at(2, 210, 990));
    expect(hub.hold()).toBe(false);
    expect(hub.state()).toBe('multi');
  });

  it('starts the Hold at once when a finger lands beside a corner finger, with no pinch expected', () => {
    const { hub, onHold } = cornered();
    const held = swipeListener(undefined, true, true);
    const plainTap = tapListener();
    hub.addSwipe(held);
    hub.addTap(plainTap);
    hub.sink.down(at(1, 10, 990));
    expect(hub.phase()).toBe('armed');
    hub.sink.down(at(2, 250, 500));
    expect(hub.hold()).toBe(true);
    expect(onHold).toHaveBeenCalledWith(false);
    hub.sink.move(at(2, 250, 440));
    expect(held.begin).toHaveBeenCalledWith('y');
    expect(hub.sink.up(at(2, 250, 440))).toBe(true);
    expect(plainTap.tap).not.toHaveBeenCalled();
  });

  it('keeps a lone corner finger ordinary: a Tap that clicks, or a Pan', () => {
    const { hub } = cornered();
    hub.addTap(tapListener(true));
    const plainTap = tapListener();
    const pan = panListener();
    hub.addTap(plainTap);
    hub.addPan(pan);
    hub.sink.down(at(1, 10, 990));
    expect(hub.sink.up(at(1, 10, 990))).toBe(false);
    expect(plainTap.tap).toHaveBeenCalledTimes(1);
    hub.sink.down(at(1, 10, 990));
    hub.sink.move(at(1, 60, 990));
    expect(hub.state()).toBe('moving');
    expect(pan.update).toHaveBeenLastCalledWith(50, 0);
    hub.sink.down(at(2, 250, 500));
    expect(hub.hold()).toBe(false);
  });

  it('takes a still press to start the Hold when a pinch is expected', () => {
    vi.useFakeTimers();
    try {
      const { hub, onHold } = cornered();
      hub.addGesture(gestureListener());
      const heldTap = tapListener(true);
      hub.addTap(heldTap);
      hub.sink.down(at(1, 10, 990));
      expect(hub.phase()).toBe('pressing');
      vi.advanceTimersByTime(299);
      expect(hub.hold()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(hub.hold()).toBe(true);
      expect(onHold).toHaveBeenCalledWith(true);
      hub.sink.down(at(2, 250, 500));
      expect(hub.sink.up(at(2, 250, 500))).toBe(true);
      expect(heldTap.tap).toHaveBeenCalledTimes(1);
      // The Hold finger lifting alone after the press clicks nothing.
      expect(hub.sink.up(at(1, 10, 990))).toBe(true);
      expect(hub.hold()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps fingers landing together a pinch, and a quick corner tap a click, when a pinch is expected', () => {
    vi.useFakeTimers();
    try {
      const { hub } = cornered();
      const plain = gestureListener();
      hub.addGesture(plain);
      hub.addTap(tapListener(true));
      hub.sink.down(at(1, 10, 990));
      vi.advanceTimersByTime(60);
      hub.sink.down(at(2, 110, 990));
      vi.advanceTimersByTime(500);
      hub.sink.move(at(2, 210, 990));
      expect(hub.hold()).toBe(false);
      expect(plain.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ scale: 2 }),
      );
      hub.sink.up(at(2, 210, 990));
      hub.sink.up(at(1, 10, 990));
      hub.sink.down(at(1, 10, 990));
      vi.advanceTimersByTime(120);
      expect(hub.sink.up(at(1, 10, 990))).toBe(false);
      vi.advanceTimersByTime(500);
      expect(hub.hold()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the Hold after the Hold finger lifts, until every finger has', () => {
    const { hub } = cornered();
    const watcher = vi.fn();
    hub.watchHold(watcher);
    const held = gestureListener(true, true);
    hub.addGesture(held);
    hub.sink.down(at(1, 10, 990));
    hub.sink.down(at(2, 200, 400));
    hub.sink.move(at(2, 240, 400));
    hub.sink.up(at(1, 10, 990));
    hub.sink.move(at(2, 260, 400));
    expect(hub.hold()).toBe(true);
    expect(held.update).toHaveBeenLastCalledWith({
      x: 60,
      y: 0,
      scale: 1,
      rotation: 0,
    });
    hub.sink.up(at(2, 260, 400));
    expect(held.finish).toHaveBeenCalledTimes(1);
    expect(hub.hold()).toBe(false);
    expect(watcher).toHaveBeenCalledTimes(2);
  });

  it('ends a Pan as interrupted when a second finger lands', () => {
    const hub = createHub();
    const pan = panListener();
    hub.addPan(pan);
    hub.sink.down(at(1, 0, 0));
    hub.sink.move(at(1, 30, 10));
    hub.sink.down(at(2, 200, 0));
    expect(pan.finish).toHaveBeenCalledWith(
      expect.objectContaining({ x: 30, y: 10, interrupted: true }),
    );
    hub.sink.up(at(2, 200, 0));
    hub.sink.up(at(1, 30, 10));
    expect(pan.finish).toHaveBeenCalledTimes(1);
  });

  it('ends the Hold when the touch is taken away', () => {
    const { hub } = cornered();
    hub.addTap(tapListener(true));
    hub.sink.down(at(1, 10, 990));
    hub.sink.down(at(2, 250, 400));
    expect(hub.sink.holding()).toBe(true);
    hub.sink.cancelAll();
    expect(hub.hold()).toBe(false);
    expect(hub.state()).toBe('idle');
  });
});
