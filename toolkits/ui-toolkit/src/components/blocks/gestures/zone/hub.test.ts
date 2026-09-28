import { describe, expect, it, vi } from 'vitest';
import type { Hold } from '../zone-machine';
import type { Axis } from '../swipe-reading';
import {
  createHub,
  type GestureListener,
  type SwipeListener,
  type TapListener,
} from './hub';

const at = (id: number, x: number, y: number, t = 0) => ({ id, x, y, t });

const gestureListener = (enabled = true, hold: Hold = 'none') =>
  ({
    enabled: () => enabled,
    hold: () => hold,
    begin: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
  }) satisfies GestureListener;

const swipeListener = (axis?: Axis, enabled = true, hold: Hold = 'none') =>
  ({
    enabled: () => enabled,
    hold: () => hold,
    axis: () => axis,
    begin: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
  }) satisfies SwipeListener;

const tapListener = (hold: Hold = 'none') =>
  ({
    enabled: () => true,
    hold: () => hold,
    tap: vi.fn(),
  }) satisfies TapListener;

const holding = () => createHub({ holds: () => true });

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

  it('makes a still finger the left Hold when a finger to its right acts', () => {
    const hub = holding();
    const plain = gestureListener();
    const left = gestureListener(true, 'left');
    const leftSwipe = swipeListener(undefined, true, 'left');
    hub.addGesture(plain);
    hub.addGesture(left);
    hub.addSwipe(leftSwipe);
    hub.sink.down(at(1, 50, 400));
    hub.sink.down(at(2, 250, 400));
    hub.sink.move(at(2, 262, 400));
    expect(hub.hold()).toBe('left');
    // The Gesture with no Hold only waited, and ended as interrupted.
    expect(plain.finish).toHaveBeenCalledWith(
      expect.objectContaining({ interrupted: true }),
    );
    // Under the Hold, the Swipe keeps the way it came before the Hold locked.
    expect(left.begin).toHaveBeenCalledWith({ x: 250, y: 400 });
    expect(leftSwipe.update).toHaveBeenLastCalledWith('x', 12);
    expect(hub.sink.up(at(2, 262, 400))).toBe(true);
    expect(left.finish).toHaveBeenCalledTimes(1);
  });

  it('makes a still finger the right Hold when a finger to its left acts', () => {
    const hub = holding();
    hub.sink.down(at(1, 300, 400));
    hub.sink.down(at(2, 100, 400));
    hub.sink.move(at(2, 100, 380));
    expect(hub.hold()).toBe('right');
  });

  it('keeps two moving fingers a pinch, even when one drifts only a little', () => {
    const hub = holding();
    const plain = gestureListener();
    hub.addGesture(plain);
    hub.sink.down(at(1, 100, 400));
    hub.sink.down(at(2, 200, 400));
    hub.sink.move(at(1, 95, 400));
    hub.sink.move(at(2, 300, 400));
    expect(hub.hold()).toBe('none');
    expect(plain.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: 2.05 }),
    );
    expect(plain.finish).not.toHaveBeenCalled();
  });

  it('taps under the Hold beside a still finger, again and again, and never clicks', () => {
    const hub = holding();
    const leftTap = tapListener('left');
    const plainTap = tapListener();
    hub.addTap(leftTap);
    hub.addTap(plainTap);
    hub.sink.down(at(1, 50, 400));
    hub.sink.down(at(2, 250, 400));
    expect(hub.sink.up(at(2, 250, 400))).toBe(true);
    expect(hub.hold()).toBe('left');
    hub.sink.down(at(3, 260, 300));
    expect(hub.sink.up(at(3, 260, 300))).toBe(true);
    expect(leftTap.tap).toHaveBeenCalledTimes(2);
    expect(leftTap.tap).toHaveBeenLastCalledWith({ point: { x: 260, y: 300 } });
    expect(plainTap.tap).not.toHaveBeenCalled();
    hub.sink.up(at(1, 50, 400));
    expect(hub.hold()).toBe('none');
  });

  it('keeps the Hold after the Hold finger lifts, until every finger has', () => {
    const hub = holding();
    const watcher = vi.fn();
    hub.watchHold(watcher);
    const left = gestureListener(true, 'left');
    hub.addGesture(left);
    hub.sink.down(at(1, 50, 400));
    hub.sink.down(at(2, 200, 400));
    hub.sink.move(at(2, 240, 400));
    hub.sink.up(at(1, 50, 400));
    hub.sink.move(at(2, 260, 400));
    expect(hub.hold()).toBe('left');
    expect(left.update).toHaveBeenLastCalledWith({
      x: 60,
      y: 0,
      scale: 1,
      rotation: 0,
    });
    hub.sink.up(at(2, 260, 400));
    expect(left.finish).toHaveBeenCalledTimes(1);
    expect(hub.hold()).toBe('none');
    expect(watcher).toHaveBeenCalledTimes(2);
  });

  it('makes no Hold once a Swipe is under way, or with Holds off', () => {
    const hub = holding();
    hub.sink.down(at(1, 250, 400));
    hub.sink.move(at(1, 280, 400));
    hub.sink.down(at(2, 50, 400));
    hub.sink.move(at(1, 320, 400));
    expect(hub.hold()).toBe('none');
    hub.sink.up(at(1, 320, 400));
    hub.sink.up(at(2, 50, 400));
    const plain = createHub();
    plain.sink.down(at(1, 50, 400));
    plain.sink.down(at(2, 250, 400));
    plain.sink.move(at(2, 290, 400));
    expect(plain.hold()).toBe('none');
  });

  it('clicks after a long still press, and ends a Hold when the touch is taken away', () => {
    const hub = holding();
    hub.sink.down(at(1, 50, 400, 0));
    expect(hub.sink.up(at(1, 50, 400, 1000))).toBe(false);
    hub.sink.down(at(1, 50, 400));
    hub.sink.down(at(2, 250, 400));
    hub.sink.move(at(2, 290, 400));
    expect(hub.sink.holding()).toBe(true);
    hub.sink.cancelAll();
    expect(hub.hold()).toBe('none');
    expect(hub.state()).toBe('idle');
  });
});
