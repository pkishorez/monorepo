import { describe, expect, it } from 'vitest';
import { stepsFrom } from '../places.ts';

const ids = (pathname: string) => {
  const { items, start } = stepsFrom(pathname);
  return { order: items.map((item) => item.id), start: items[start]?.id };
};

describe('the Place order', () => {
  it('Steps from a Place through every Place', () => {
    expect(ids('/months')).toEqual({
      order: ['home', 'entries', 'months', 'settings'],
      start: 'months',
    });
    expect(ids('/')).toMatchObject({ start: 'home' });
  });

  it('puts an Entry or a Month just under its list', () => {
    expect(ids('/entries/abc')).toEqual({
      order: ['home', 'entries', 'entry', 'months', 'settings'],
      start: 'entry',
    });
    expect(ids('/months/2026-10')).toEqual({
      order: ['home', 'entries', 'months', 'month', 'settings'],
      start: 'month',
    });
  });
});
