import { describe, expect, it } from 'vitest';
import { rangeOf } from '../files.server.ts';

describe('rangeOf', () => {
  it('answers whole with no header, a malformed one, or several ranges', () => {
    expect(rangeOf(undefined, 100)).toEqual({ _tag: 'Whole' });
    expect(rangeOf('bytes=', 100)).toEqual({ _tag: 'Whole' });
    expect(rangeOf('items=0-5', 100)).toEqual({ _tag: 'Whole' });
    expect(rangeOf('bytes=0-5,10-20', 100)).toEqual({ _tag: 'Whole' });
    expect(rangeOf('bytes=9-3', 100)).toEqual({ _tag: 'Whole' });
  });

  it('reads a start and an end, the end inclusive and kept inside the file', () => {
    expect(rangeOf('bytes=0-0', 100)).toEqual({
      _tag: 'Part',
      start: 0,
      end: 0,
    });
    expect(rangeOf('bytes=10-19', 100)).toEqual({
      _tag: 'Part',
      start: 10,
      end: 19,
    });
    expect(rangeOf('bytes=90-500', 100)).toEqual({
      _tag: 'Part',
      start: 90,
      end: 99,
    });
  });

  it('reads an open end, as a player seeking asks', () => {
    expect(rangeOf('bytes=0-', 100)).toEqual({
      _tag: 'Part',
      start: 0,
      end: 99,
    });
    expect(rangeOf('bytes=42-', 100)).toEqual({
      _tag: 'Part',
      start: 42,
      end: 99,
    });
  });

  it('reads the last bytes', () => {
    expect(rangeOf('bytes=-10', 100)).toEqual({
      _tag: 'Part',
      start: 90,
      end: 99,
    });
    expect(rangeOf('bytes=-500', 100)).toEqual({
      _tag: 'Part',
      start: 0,
      end: 99,
    });
  });

  it('refuses a range past the end', () => {
    expect(rangeOf('bytes=100-', 100)).toEqual({ _tag: 'Unsatisfiable' });
    expect(rangeOf('bytes=-0', 100)).toEqual({ _tag: 'Unsatisfiable' });
    expect(rangeOf('bytes=0-', 0)).toEqual({ _tag: 'Unsatisfiable' });
  });
});
