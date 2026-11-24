import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diskTree, isRelative, resolveRelative } from '../index.ts';

/*
 * The one way the lint and the DevTools find the file an import names,
 * and the disk Tree the lint reads, which must see a folder change while
 * an editor keeps the lint running.
 */

describe('resolveRelative', () => {
  const files = new Set([
    'src/a/index.ts',
    'src/a/part.tsx',
    'src/b/old.cts',
    'src/c/button.jsx',
    'src/d/data.mts',
    'src/e/plain.ts',
  ]);
  const exists = (path: string) => files.has(path);
  const resolve = (specifier: string) =>
    resolveRelative('src/main.ts', specifier, exists);

  it('names a folder by its index file, and a bare path by its extension', () => {
    expect(resolve('./a')).toBe('src/a/index.ts');
    expect(resolve('./a/part')).toBe('src/a/part.tsx');
    expect(resolve('./e/plain.ts')).toBe('src/e/plain.ts');
  });

  it('reads a compiled extension as the source beside it', () => {
    expect(resolve('./a/part.js')).toBe('src/a/part.tsx');
    expect(resolve('./b/old.cjs')).toBe('src/b/old.cts');
    expect(resolve('./c/button.js')).toBe('src/c/button.jsx');
    expect(resolve('./d/data.mjs')).toBe('src/d/data.mts');
  });

  it('follows only relative specifiers, and never above the root', () => {
    expect(resolve('#a/index.ts')).toBeUndefined();
    expect(resolve('@/a')).toBeUndefined();
    expect(resolve('effect')).toBeUndefined();
    expect(resolve('../../outside.ts')).toBeUndefined();
    expect(isRelative('.')).toBe(true);
    expect(isRelative('.hidden')).toBe(false);
  });

  it('works on absolute paths, as the lint gives them', () => {
    expect(
      resolveRelative(
        '/repo/src/main.ts',
        '../lib/x.js',
        (path) => path === '/repo/lib/x.ts',
      ),
    ).toBe('/repo/lib/x.ts');
  });
});

describe('diskTree', () => {
  it('sees an index file or a package.json added after it first looked', () => {
    const root = mkdtempSync(join(tmpdir(), 'monoverse-tree-'));
    mkdirSync(join(root, 'pkg/src/a'), { recursive: true });
    writeFileSync(join(root, 'pkg/package.json'), '{}');
    const tree = diskTree();
    expect(tree.isModule(join(root, 'pkg/src/a'))).toBe(false);
    expect(tree.packageOf(join(root, 'pkg/src/a'))).toBe(join(root, 'pkg'));

    writeFileSync(join(root, 'pkg/src/a/index.ts'), '');
    writeFileSync(join(root, 'pkg/src/package.json'), '{}');
    expect(tree.isModule(join(root, 'pkg/src/a'))).toBe(true);
    expect(tree.packageOf(join(root, 'pkg/src/a'))).toBe(join(root, 'pkg/src'));
  });
});
