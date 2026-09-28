import { describe, expect, it, vi } from 'vitest';
import type { Axis } from '../swipe-reading';
import { createHub, type GestureListener, type SwipeListener } from './hub';

const at = (id: number, x: number, y: number, t = 0) => ({ id, x, y, t });

const gestureListener = (enabled = true) =>
  ({
    enabled: () => enabled,
    begin: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
  }) satisfies GestureListener;

const swipeListener = (axis?: Axis, enabled = true) =>
  ({
    enabled: () => enabled,
    axis: () => axis,
    begin: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
  }) satisfies SwipeListener;

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
});
