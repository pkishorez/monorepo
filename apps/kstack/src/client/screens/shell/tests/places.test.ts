import { describe, expect, it } from 'vitest';
import { PAGE_TRANSITION, stepsFrom } from '../places.ts';

const ids = (pathname: string) => {
  const { items, start } = stepsFrom(pathname);
  return { order: items.map((item) => item.id), start: items[start]?.id };
};

const slide = (from: string | undefined, to: string) =>
  PAGE_TRANSITION.types({
    ...(from === undefined ? {} : { fromLocation: { pathname: from } }),
    toLocation: { pathname: to },
  });

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

  it('slides the page up toward a later Place and down toward an earlier one', () => {
    expect(slide('/', '/entries')).toEqual(['up']);
    expect(slide('/settings', '/months')).toEqual(['down']);
    expect(slide('/entries', '/entries/abc')).toEqual(['up']);
    expect(slide('/entries/abc', '/months')).toEqual(['up']);
    expect(slide('/months/2026-10', '/months')).toEqual(['down']);
  });

  it('does not slide within a Place, on the first page, or outside Ledger', () => {
    expect(slide('/months/2026-09', '/months/2026-10')).toBe(false);
    expect(slide('/entries', '/entries')).toBe(false);
    expect(slide(undefined, '/entries')).toBe(false);
    expect(slide('/', '/offline')).toBe(false);
  });
});
