import { describe, expect, it } from 'vitest';
import { toggleSubtree } from './expand';

const files = ['src/a/one.ts', 'src/a/nested/two.ts', 'src/b/deep/three.ts'];

describe('toggleSubtree', () => {
  it('recursively collapses descendants but keeps the folder expanded', () => {
    expect(
      toggleSubtree(files, ['src', 'src/a', 'src/a/nested', 'src/b'], 'src/a'),
    ).toEqual(['src', 'src/a', 'src/b']);
  });

  it('expands a collapsed folder to reveal its first level only', () => {
    expect(toggleSubtree(files, [], 'src')).toEqual(['src']);
  });

  it('toggles continuously between deep expansion and one visible level', () => {
    const oneLevel = toggleSubtree(files, [], 'src');
    const deep = toggleSubtree(files, oneLevel, 'src');
    const collapsed = toggleSubtree(files, deep, 'src');

    expect(deep).toEqual([
      'src',
      'src/a',
      'src/a/nested',
      'src/b',
      'src/b/deep',
    ]);
    expect(collapsed).toEqual(oneLevel);
  });

  it('behaves like a left click when no nested folders exist', () => {
    const collapsed = ['src', 'src/a'];
    const expanded = toggleSubtree(files, collapsed, 'src/a/nested');

    expect(expanded).toEqual(['src', 'src/a', 'src/a/nested']);
    expect(toggleSubtree(files, expanded, 'src/a/nested')).toEqual(collapsed);
  });
});
