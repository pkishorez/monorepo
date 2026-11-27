import { describe, expect, it } from 'vitest';
import { print, printLines } from '../contract/index.ts';

describe('print', () => {
  it('writes a scalar on its own', () => {
    expect([print('plain'), print(5), print(true), print(null)]).toEqual([
      'plain',
      '5',
      'true',
      'null',
    ]);
    expect([print([]), print({})]).toEqual(['[]', '{}']);
  });

  it('writes a struct as key: value lines, short ones inline', () => {
    expect(
      print({
        _tag: 'Open',
        name: 'Ada Lovelace',
        small: { a: 1, b: 2 },
        list: [1, 2, 3],
      }),
    ).toBe(
      [
        '_tag: Open',
        'name: Ada Lovelace',
        'small: { a: 1, b: 2 }',
        'list: [1, 2, 3]',
      ].join('\n'),
    );
  });

  it('quotes a string only where it would read as something else', () => {
    expect(
      print({
        empty: '',
        spaced: ' x',
        number: '12',
        word: 'true',
        nothing: 'null',
        colon: 'a: b',
        lines: 'a\nb',
        dash: '- a',
        plain: 'a, b',
        inline: ['a, b'],
      }),
    ).toBe(
      [
        'empty: ""',
        'spaced: " x"',
        'number: "12"',
        'word: "true"',
        'nothing: "null"',
        'colon: "a: b"',
        'lines: "a\\nb"',
        'dash: "- a"',
        'plain: a, b',
        'inline: ["a, b"]',
      ].join('\n'),
    );
  });

  it('nests what does not fit the width by two spaces, items of a list after a dash', () => {
    expect(
      print(
        {
          notes: [
            { at: '2024-01-01', text: 'the first note, long enough to wrap' },
            { at: '2024-01-02', text: 'short' },
          ],
        },
        { width: 50 },
      ),
    ).toBe(
      [
        'notes:',
        '  - at: 2024-01-01',
        '    text: the first note, long enough to wrap',
        '  - { at: 2024-01-02, text: short }',
      ].join('\n'),
    );
  });

  it('says where it cut a long list or a long string', () => {
    const many = print(Array.from({ length: 25 }, (_, at) => at));
    expect(many).toBe(
      `[${Array.from({ length: 20 }, (_, at) => at).join(', ')}, … 5 more]`,
    );
    expect(print('x'.repeat(250))).toBe(`${'x'.repeat(200)}…(250 chars)`);
    const wide = print(
      Array.from({ length: 22 }, (_, id) => ({ id, name: `item ${id}` })),
    ).split('\n');
    expect(wide).toHaveLength(21);
    expect(wide.at(-1)).toBe('… 2 more');
  });

  it('folds what is deeper than the depth asked', () => {
    expect(print({ a: { b: { c: 1, d: 2 } } }, { depth: 2 })).toBe(
      'a: { b: {…2 keys} }',
    );
    expect(print({ a: [[1]] }, { depth: 1 })).toBe('a: […1 item]');
  });

  it('quotes a key that is not a plain name', () => {
    expect(print({ 'weird key': 1, 'Diary/counter#1': 2 })).toBe(
      ['"weird key": 1', 'Diary/counter#1: 2'].join('\n'),
    );
  });
});

describe('printLines', () => {
  it('gives each line its indent and the path of the value it shows, so a field can be marked', () => {
    expect(
      printLines(
        { count: 1, page: { items: [1, 2], title: 'x'.repeat(40) } },
        { width: 30 },
      ),
    ).toEqual([
      { indent: 0, text: 'count: 1', path: ['count'] },
      { indent: 0, text: 'page:', path: ['page'] },
      { indent: 1, text: 'items: [1, 2]', path: ['page', 'items'] },
      { indent: 1, text: `title: ${'x'.repeat(40)}`, path: ['page', 'title'] },
    ]);
  });
});
