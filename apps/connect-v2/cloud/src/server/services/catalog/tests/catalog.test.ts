import { describe, expect, it } from 'vitest';
import { enabledPlugins, pluginsOf } from '../real/index.js';

const release = (letter: string) => ({
  hash: letter.repeat(64),
  url: `https://files.test/${letter}`,
});

const CATALOG = {
  code: { ...release('a'), enabledByDefault: true },
  notes: { ...release('b'), enabledByDefault: false },
};

describe('enabledPlugins', () => {
  it('is every Plugin enabled by default when nothing was chosen', () => {
    expect(enabledPlugins(CATALOG, {})).toEqual({ code: release('a') });
  });

  it('adds a Plugin chosen enabled and drops one chosen disabled', () => {
    expect(
      enabledPlugins(CATALOG, { code: 'disabled', notes: 'enabled' }),
    ).toEqual({ notes: release('b') });
    expect(enabledPlugins(CATALOG, { code: 'enabled' })).toEqual({
      code: release('a'),
    });
  });

  it('ignores a choice for a Plugin not in the Catalog', () => {
    expect(
      enabledPlugins(CATALOG, {
        gone: 'enabled',
        constructor: 'enabled',
      } as const),
    ).toEqual({ code: release('a') });
  });

  it('is nothing for an empty Catalog', () => {
    expect(enabledPlugins({}, { code: 'enabled' })).toEqual({});
  });
});

describe('pluginsOf', () => {
  it('lists every Catalog Plugin with its default and whether it is enabled', () => {
    expect(pluginsOf(CATALOG, { code: 'disabled', gone: 'enabled' })).toEqual([
      { name: 'code', enabledByDefault: true, enabled: false },
      { name: 'notes', enabledByDefault: false, enabled: false },
    ]);
  });
});
