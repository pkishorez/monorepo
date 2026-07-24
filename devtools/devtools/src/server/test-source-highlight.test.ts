import { describe, expect, it } from 'vitest';

import { findTestSourceHighlight } from './test-source-highlight.js';

describe('findTestSourceHighlight', () => {
  it('finds the complete multiline test call', () => {
    const content = [
      "describe('suite', () => {",
      "  test('works', async () => {",
      '    const value = await operation();',
      '    expect(value).toBe(true);',
      '  });',
      '});',
    ].join('\n');

    expect(
      findTestSourceHighlight('example.test.ts', content, 'works'),
    ).toEqual({
      startLine: 2,
      endLine: 5,
    });
  });

  it('supports chained parameterized test calls', () => {
    const content = [
      'test.each([',
      "  ['one'],",
      "])('reports %s', (value) => {",
      '  expect(value).toBeTruthy();',
      '});',
    ].join('\n');

    expect(
      findTestSourceHighlight('example.test.ts', content, 'reports %s'),
    ).toEqual({
      startLine: 1,
      endLine: 5,
    });
  });

  it('does not guess when a test name is ambiguous', () => {
    const content = ["test('same', () => {});", "test('same', () => {});"].join(
      '\n',
    );

    expect(
      findTestSourceHighlight('example.test.ts', content, 'same'),
    ).toBeUndefined();
  });

  it('ignores non-test calls with a matching first argument', () => {
    const content = "track('works', () => {});";

    expect(
      findTestSourceHighlight('example.ts', content, 'works'),
    ).toBeUndefined();
  });
});
