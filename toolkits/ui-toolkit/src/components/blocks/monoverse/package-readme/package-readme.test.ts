import { describe, expect, test } from 'vitest';

import { resolveReadmeLink } from './package-readme';

describe('resolveReadmeLink', () => {
  test('resolves a nested markdown link against the Package root', () => {
    expect(resolveReadmeLink('README.md', 'src/eschema/README.md')).toEqual({
      kind: 'markdown',
      path: 'src/eschema/README.md',
    });
  });

  test('resolves a sibling markdown link against the current folder', () => {
    expect(
      resolveReadmeLink('src/eschema/README.md', '../core/README.md'),
    ).toEqual({ kind: 'markdown', path: 'src/core/README.md' });
  });

  test('drops fragments and queries from markdown links', () => {
    expect(resolveReadmeLink('README.md', './docs/guide.md#usage')).toEqual({
      kind: 'markdown',
      path: 'docs/guide.md',
    });
  });

  test('keeps in-page anchors as anchors', () => {
    expect(resolveReadmeLink('README.md', '#usage')).toEqual({
      kind: 'anchor',
    });
  });

  test('opens links that escape the Package elsewhere', () => {
    expect(resolveReadmeLink('README.md', '../other/README.md')).toEqual({
      kind: 'external',
      href: '../other/README.md',
    });
  });

  test('opens absolute URLs, repo-relative paths, and source files elsewhere', () => {
    expect(resolveReadmeLink('README.md', 'https://example.com/a.md')).toEqual({
      kind: 'external',
      href: 'https://example.com/a.md',
    });
    expect(resolveReadmeLink('README.md', '/toolkits/x/README.md')).toEqual({
      kind: 'external',
      href: '/toolkits/x/README.md',
    });
    expect(resolveReadmeLink('README.md', 'src/index.ts')).toEqual({
      kind: 'external',
      href: 'src/index.ts',
    });
  });
});
