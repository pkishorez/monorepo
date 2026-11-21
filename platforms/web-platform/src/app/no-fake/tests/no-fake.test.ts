import { build, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { carryingFake, noFake } from '../index.ts';

const ENTRY = '\0no-fake-entry.js';
const LAZY = '\0no-fake-lazy.js';

/** Builds `code` as an app would, with `noFake` among its plugins; `lazy` is a module `code` may import. */
const bundle = (code: string, lazy = '') => {
  const entry: Plugin = {
    name: 'no-fake-entry',
    resolveId: (id) => (id === ENTRY || id === LAZY ? id : undefined),
    load: (id) => (id === ENTRY ? code : id === LAZY ? lazy : undefined),
  };
  return build({
    configFile: false,
    logLevel: 'silent',
    plugins: [entry, noFake() as Plugin],
    build: { write: false, rollupOptions: { input: ENTRY } },
  });
};

describe('noFake', () => {
  it('fails a build that carries a fake', async () => {
    await expect(
      bundle(`console.warn('kestack-fake: anyone may sign in');`),
    ).rejects.toThrow(/carries a fake \(kestack-fake\)/);
  }, 60_000);

  it('fails one whose fake is only in a lazy chunk', async () => {
    await expect(
      bundle(
        `if (location.hash === '#fake') import('${LAZY}').then((fake) => console.log(fake.bubble));`,
        `export const bubble = 'kestack-fake-bubble';`,
      ),
    ).rejects.toThrow(/carries a fake/);
  }, 60_000);

  it('lets a build without one through', async () => {
    await expect(bundle(`console.log('signed in');`)).resolves.toBeDefined();
  }, 60_000);
});

describe('carryingFake', () => {
  it('names each chunk carrying the mark, and no asset', () => {
    expect(
      carryingFake({
        'a.js': { type: 'chunk', fileName: 'a.js', code: 'x("kestack-fake")' },
        'b.js': { type: 'chunk', fileName: 'b.js', code: 'x("real")' },
        'c.txt': { type: 'asset', fileName: 'c.txt' },
      }),
    ).toEqual(['a.js']);
  });
});
