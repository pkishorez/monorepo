import { describe, expect, it } from 'vitest';
import { createHoldReading } from './hold-reading';

describe('hold reading', () => {
  it('starts a Hold from the first finger in a Hold Zone, however briefly', () => {
    const hold = createHoldReading();
    expect(hold.down(1, 'left')).toBe('hold');
    expect(hold.hold()).toBe('left');
    expect(hold.up(1)).toEqual({ finger: false, released: true });
    expect(hold.hold()).toBe('none');
  });

  it('keeps the Hold until no finger is left, even after the Hold finger lifts', () => {
    const hold = createHoldReading();
    hold.down(1, 'left');
    expect(hold.down(2, undefined)).toBe('finger');
    expect(hold.up(1)).toEqual({ finger: false, released: false });
    expect(hold.hold()).toBe('left');
    expect(hold.up(2)).toEqual({ finger: true, released: true });
    expect(hold.hold()).toBe('none');
  });

  it('sets aside a finger in either Hold Zone while a Hold is on', () => {
    const hold = createHoldReading();
    hold.down(1, 'left');
    hold.down(2, undefined);
    hold.up(1);
    expect(hold.down(3, 'left')).toBe('aside');
    expect(hold.down(4, 'right')).toBe('aside');
    expect(hold.hold()).toBe('left');
    expect(hold.up(4)).toEqual({ finger: false, released: false });
  });

  it('treats a finger in a Hold Zone as an ordinary one during a Gesture with no Hold', () => {
    const hold = createHoldReading();
    hold.down(1, undefined);
    expect(hold.down(2, 'right')).toBe('finger');
    expect(hold.hold()).toBe('none');
  });
});
