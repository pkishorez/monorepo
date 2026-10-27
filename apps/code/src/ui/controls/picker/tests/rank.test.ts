import { describe, expect, it } from 'vitest';
import { rank } from '../rank.ts';

const entries = [
  { label: 'review', detail: 'Review the current diff' },
  { label: 'code-review', detail: 'Look for bugs' },
  { label: 'preview', detail: 'Open a preview' },
  { label: 'reword', detail: 'Rewrite a commit message' },
  { label: 'deploy', detail: 'Ship it after review' },
];

const labels = (query: string) =>
  rank(entries, query).map(({ entry }) => entry.label);

describe('rank', () => {
  it('keeps the order given for an empty query', () => {
    expect(labels('')).toEqual([
      'review',
      'code-review',
      'preview',
      'reword',
      'deploy',
    ]);
    expect(labels('  ')).toEqual(labels(''));
  });

  it('ranks prefix, word start, substring, letters in order, then detail', () => {
    expect(labels('rev')).toEqual([
      'review',
      'code-review',
      'preview',
      'deploy',
    ]);
    expect(labels('rw')).toEqual([
      'review',
      'reword',
      'preview',
      'code-review',
    ]);
  });

  it('counts a slash as a word start', () => {
    const slashed = [{ label: '/preview' }, { label: '/review' }];
    expect(rank(slashed, 'rev').map(({ entry }) => entry.label)).toEqual([
      '/review',
      '/preview',
    ]);
  });

  it('matches without regard to case', () => {
    expect(labels('REVIEW')[0]).toBe('review');
  });

  it('drops what does not match', () => {
    expect(labels('zzz')).toEqual([]);
  });

  it('reports the matched letters of the label', () => {
    expect(rank(entries, 'rev')[1]).toMatchObject({
      entry: { label: 'code-review' },
      matched: [5, 6, 7],
    });
    expect(rank(entries, 'rw')[0]?.matched).toEqual([0, 5]);
  });

  it('finds a row by its keys, first when they are the query', () => {
    const keyed = [
      { label: 'Back to the last page', keys: { out: ['ctrl+o'], vim: [] } },
      {
        label: 'Show or hide the sidebar',
        keys: { out: ['ctrl+b'], vim: ['b'] },
      },
      {
        label: 'Turn Vim Mode on or off',
        keys: { out: ['mod+alt+v'], vim: [] },
      },
    ];
    const found = (query: string) =>
      rank(keyed, query).map(({ entry }) => entry.label);
    expect(found('b')[0]).toBe('Show or hide the sidebar');
    expect(found('ctrl+b')).toEqual(['Show or hide the sidebar']);
    expect(found('Ctrl B')).toEqual(['Show or hide the sidebar']);
    expect(found('cmd+alt+v')).toEqual(['Turn Vim Mode on or off']);
    expect([...found('ctrl')].sort()).toEqual([
      'Back to the last page',
      'Show or hide the sidebar',
      'Turn Vim Mode on or off',
    ]);
  });
});
