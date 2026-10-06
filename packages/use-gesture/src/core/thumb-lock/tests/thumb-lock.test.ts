import { describe, expect, it } from 'vitest';
import { createGestureProvider } from '../../provider/index.ts';
import { thumbLock } from '../index.ts';

// One zone, and every finger lands in it.
const ZONE = 'zone';
const setup = (width = 400) => {
  const provider = createGestureProvider<string, string>({
    zoneOf: () => ZONE,
    parentOf: () => null,
    trapped: () => false,
  });
  provider.addZone(ZONE);
  const log: Array<string> = [];
  const listener = thumbLock<string>({
    enabled: () => true,
    width: () => width,
    onLock: () => log.push('lock'),
    onMove: (finger) => log.push(`move ${finger.x},${finger.y}`),
    onEnd: (lifted) => log.push(lifted ? 'lifted' : 'off'),
  });
  provider.addGesture(ZONE, listener);
  let t = 0;
  const at = (id: number, x: number, y: number) => ({
    id,
    x,
    y,
    t: (t += 16),
    target: ZONE,
  });
  const { sink } = provider;
  return {
    log,
    listener,
    down: (id: number, x: number, y: number) => sink.down(at(id, x, y)),
    move: (id: number, x: number, y: number) => sink.move(at(id, x, y)),
    up: (id: number, x: number, y: number) => sink.up(at(id, x, y)),
    cancel: () => sink.cancelAll((t += 16)),
  };
};

describe('thumbLock', () => {
  it('locks when a finger lands beside a still left thumb, and follows it', () => {
    const touch = setup();
    touch.down(1, 40, 600);
    touch.down(2, 300, 400);
    touch.move(2, 300, 430);
    touch.move(2, 305, 470);
    touch.up(2, 305, 470);
    expect(touch.log).toEqual(['lock', 'move 0,30', 'move 5,70', 'lifted']);
  });

  it('takes every Direction only while it holds', () => {
    const touch = setup();
    expect(touch.listener.directions?.()).toEqual([]);
    touch.down(1, 40, 600);
    touch.down(2, 300, 400);
    expect(touch.listener.directions?.()).toBe('all');
    touch.up(2, 300, 400);
    expect(touch.listener.directions?.()).toEqual([]);
  });

  it('is called off when the thumb lifts first', () => {
    const touch = setup();
    touch.down(1, 40, 600);
    touch.down(2, 300, 400);
    touch.move(2, 300, 440);
    touch.up(1, 40, 600);
    touch.move(2, 300, 480);
    touch.up(2, 300, 480);
    expect(touch.log).toEqual(['lock', 'move 0,40', 'off']);
  });

  it('lets the thumb stay for another Lock', () => {
    const touch = setup();
    touch.down(1, 40, 600);
    touch.down(2, 300, 400);
    touch.up(2, 300, 400);
    touch.down(3, 300, 400);
    touch.move(3, 340, 400);
    touch.up(3, 340, 400);
    expect(touch.log).toEqual([
      'lock',
      'lifted',
      'lock',
      'move 40,0',
      'lifted',
    ]);
  });

  it('never locks on a thumb that landed on the right half', () => {
    const touch = setup();
    touch.down(1, 260, 600);
    touch.down(2, 100, 400);
    touch.move(2, 100, 460);
    touch.up(2, 100, 460);
    expect(touch.log).toEqual([]);
  });

  it('never locks on a thumb that moved', () => {
    const touch = setup();
    touch.down(1, 40, 600);
    touch.move(1, 40, 630);
    touch.down(2, 300, 400);
    touch.move(2, 300, 460);
    expect(touch.log).toEqual([]);
  });

  it('leaves one finger alone', () => {
    const touch = setup();
    touch.down(1, 40, 600);
    touch.move(1, 40, 500);
    touch.up(1, 40, 500);
    expect(touch.log).toEqual([]);
  });

  it('is called off when the touch is taken', () => {
    const touch = setup();
    touch.down(1, 40, 600);
    touch.down(2, 300, 400);
    touch.cancel();
    expect(touch.log).toEqual(['lock', 'off']);
  });
});
