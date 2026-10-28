import { describe, expect, it } from 'vitest';
import { keep, nameFor, readableName } from './name.ts';
import type { Kept } from './name.ts';

const storage = (): NonNullable<Kept> & {
  readonly values: Map<string, string>;
} => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
};

const page = 'http://localhost:5173/notes';

describe('the name a Kabuki Session asks for', () => {
  it('is the one the page URL asks for, first', () => {
    const kept = storage();
    keep(kept, 'Diary', 'kept-name');
    expect(
      nameFor({
        app: 'Diary',
        page: `${page}?kabuki-session=asked`,
        given: 'given',
        kept,
      }),
    ).toBe('asked');
  });

  it('else the one given, else the one this tab kept for the app', () => {
    const kept = storage();
    keep(kept, 'Diary', 'kept-name');
    expect(nameFor({ app: 'Diary', page, given: 'given', kept })).toBe('given');
    expect(nameFor({ app: 'Diary', page, kept })).toBe('kept-name');
  });

  it('else a readable one, made again only where nothing was kept', () => {
    const kept = storage();
    expect(nameFor({ app: 'Diary', page, kept, random: () => 0 })).toBe(
      'quiet-otter',
    );
    expect(nameFor({ app: 'Other', page, kept: undefined })).toMatch(
      /^[a-z]+-[a-z]+$/,
    );
    expect(readableName(() => 0.99)).toBe('clever-zebra');
  });

  it('keeps nothing where storage is shut', () => {
    const shut: Kept = {
      getItem: () => null,
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(() => keep(shut, 'Diary', 'name')).not.toThrow();
  });
});
