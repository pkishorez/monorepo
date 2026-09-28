import { describe, expect, it } from 'vitest';
import { createHoldReading } from './hold-reading';

const at = (id: number, t = 0, x = 0, y = 0) => ({ id, x, y, t });

describe('hold reading', () => {
  it('starts a Hold when another finger lands after the still corner finger', () => {
    const hold = createHoldReading();
    expect(hold.down(at(1, 0), 'left')).toBe('finger');
    expect(hold.hold()).toBe('none');
    expect(hold.down(at(2, 200), undefined)).toBe('held');
    expect(hold.hold()).toBe('left');
  });

  it('leaves a corner finger ordinary when it lifts or moves first', () => {
    const hold = createHoldReading();
    hold.down(at(1, 0), 'left');
    expect(hold.up(1)).toEqual({ finger: true, released: false });
    hold.down(at(1, 0), 'left');
    hold.move(at(1, 50, 20, 0));
    expect(hold.down(at(2, 300), undefined)).toBe('finger');
    expect(hold.hold()).toBe('none');
  });

  it('keeps fingers landing close together a pinch', () => {
    const hold = createHoldReading();
    hold.down(at(1, 0), 'right');
    expect(hold.down(at(2, 60), undefined)).toBe('finger');
    expect(hold.hold()).toBe('none');
  });

  it('keeps the Hold until no finger is left, even after the Hold finger lifts', () => {
    const hold = createHoldReading();
    hold.down(at(1, 0), 'left');
    hold.down(at(2, 200), undefined);
    expect(hold.up(1)).toEqual({ finger: false, released: false });
    expect(hold.hold()).toBe('left');
    expect(hold.up(2)).toEqual({ finger: true, released: true });
    expect(hold.hold()).toBe('none');
  });

  it('sets aside a finger in either Hold Zone while a Hold is on', () => {
    const hold = createHoldReading();
    hold.down(at(1, 0), 'left');
    hold.down(at(2, 200), undefined);
    hold.up(1);
    expect(hold.down(at(3, 400), 'left')).toBe('aside');
    expect(hold.down(at(4, 500), 'right')).toBe('aside');
    expect(hold.hold()).toBe('left');
    expect(hold.up(4)).toEqual({ finger: false, released: false });
  });

  it('treats a corner finger as ordinary when it is not the first down', () => {
    const hold = createHoldReading();
    hold.down(at(1, 0), undefined);
    expect(hold.down(at(2, 300), 'right')).toBe('finger');
    expect(hold.down(at(3, 600), undefined)).toBe('finger');
    expect(hold.hold()).toBe('none');
  });
});
