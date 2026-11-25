import { afterEach, describe, expect, it, vi } from 'vitest';
import { Schema } from 'effect';
import { keeper, resumeAt, speedOf } from '../kept.ts';
import { kept, type Place, throttled } from '../store.ts';

const memory = () => {
  const values = new Map<string, string>();
  const place: Place = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
  return { values, place: () => place };
};

describe('kept', () => {
  it('reads back what it wrote, under a versioned key', () => {
    const { values, place } = memory();
    const count = kept('count', Schema.Number, place);
    count.write(3);
    expect(count.read()).toBe(3);
    expect([...values.keys()]).toEqual(['ke-video:v1:count']);
  });

  it('reads nothing when nothing was kept', () => {
    expect(kept('none', Schema.Number, memory().place).read()).toBeNull();
  });

  it('reads damaged or old values as nothing', () => {
    const { values, place } = memory();
    const count = kept('count', Schema.Number, place);
    values.set('ke-video:v1:count', '{not json');
    expect(count.read()).toBeNull();
    values.set('ke-video:v1:count', '"three"');
    expect(count.read()).toBeNull();
  });

  it('keeps nothing, and throws nothing, when storage refuses', () => {
    const refusing: Place = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const count = kept('count', Schema.Number, () => refusing);
    expect(() => count.write(1)).not.toThrow();
    expect(count.read()).toBeNull();
    expect(() => count.clear()).not.toThrow();
  });
});

describe('keeper', () => {
  it('changes the settings named and keeps the rest, telling who listens', () => {
    const { place } = memory();
    const keep = keeper(place);
    const heard = vi.fn();
    keep.settings.subscribe(heard);
    keep.settings.change({ layout: 'wide' });
    keep.settings.change({ immersive: true });
    expect(keep.settings.read()).toEqual({ layout: 'wide', immersive: true });
    expect(heard).toHaveBeenCalledTimes(2);
    expect(keeper(place).settings.read()).toEqual({
      layout: 'wide',
      immersive: true,
    });
  });

  it('drops settings of an unknown shape rather than breaking', () => {
    const { values, place } = memory();
    values.set('ke-video:v1:settings', '{"layout":"huge"}');
    expect(keeper(place).settings.read()).toEqual({});
  });

  it('keeps each video apart, merging the rows read', () => {
    const keep = keeper(memory().place);
    keep.watched.change('a', { time: 83, rows: { transcript: 12 } });
    keep.watched.change('a', { rows: { cuts: 40 } });
    keep.watched.change('b', { following: false });
    expect(keep.watched.read('a')).toEqual({
      time: 83,
      rows: { transcript: 12, cuts: 40 },
    });
    expect(keep.watched.read('b')).toEqual({ following: false });
  });

  it('forgets the time of a video finished, and nothing else', () => {
    const keep = keeper(memory().place);
    keep.watched.change('a', { time: 83, following: false });
    keep.watched.finish('a');
    expect(keep.watched.read('a')).toEqual({ following: false });
  });

  it('keeps a draft until it is emptied', () => {
    const { values, place } = memory();
    const keep = keeper(place);
    keep.draft.write('https://youtu.be/x');
    expect(keep.draft.read()).toBe('https://youtu.be/x');
    keep.draft.write('  ');
    expect(keep.draft.read()).toBe('');
    expect(values.size).toBe(0);
  });
});

describe('resumeAt', () => {
  it('resumes where it was', () => {
    expect(resumeAt(83, 600)).toBe(83);
  });

  it('starts at the top near either end, or with nothing kept', () => {
    expect(resumeAt(undefined, 600)).toBeNull();
    expect(resumeAt(2, 600)).toBeNull();
    expect(resumeAt(595, 600)).toBeNull();
    expect(resumeAt(83, Number.NaN)).toBeNull();
  });
});

describe('speedOf', () => {
  it('takes a speed the player plays at, and no other', () => {
    expect(speedOf(1.5)).toBe(1.5);
    expect(speedOf(0)).toBeNull();
    expect(speedOf(16)).toBeNull();
    expect(speedOf(undefined)).toBeNull();
  });
});

describe('throttled', () => {
  afterEach(() => vi.useRealTimers());

  it('runs at once, then at most once a period, with the latest arguments', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const saved = throttled(run, 2000, () => Date.now());
    saved.call(1);
    saved.call(2);
    saved.call(3);
    expect(run.mock.calls).toEqual([[1]]);
    vi.advanceTimersByTime(2000);
    expect(run.mock.calls).toEqual([[1], [3]]);
  });

  it('runs a held call now on flush, and drops it on cancel', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const saved = throttled(run, 2000, () => Date.now());
    saved.call(1);
    saved.call(2);
    saved.flush();
    expect(run.mock.calls).toEqual([[1], [2]]);
    saved.call(3);
    saved.cancel();
    vi.advanceTimersByTime(5000);
    expect(run.mock.calls).toEqual([[1], [2]]);
  });
});
