import { describe, expect, it } from 'vitest';
import { rank } from './rank.ts';

const entries = [
  { name: 'review', description: 'Review the current diff' },
  { name: 'code-review', description: 'Look for bugs' },
  { name: 'preview', description: 'Open a preview' },
  { name: 'reword', description: 'Rewrite a commit message' },
  { name: 'deploy', description: 'Ship it after review' },
];

const names = (query: string) =>
  rank(entries, query).map(({ entry }) => entry.name);

describe('rank', () => {
  it('lists everything, shortest name first, for an empty query', () => {
    expect(names('')).toEqual([
      'deploy',
      'review',
      'reword',
      'preview',
      'code-review',
    ]);
  });

  it('ranks prefix, word start, substring, letters in order, then description', () => {
    expect(names('rev')).toEqual([
      'review',
      'code-review',
      'preview',
      'deploy',
    ]);
    expect(names('rw')).toEqual(['review', 'reword', 'preview', 'code-review']);
  });

  it('matches without regard to case', () => {
    expect(names('REVIEW')[0]).toBe('review');
  });

  it('drops what does not match', () => {
    expect(names('zzz')).toEqual([]);
  });

  it('reports the matched letters of the name', () => {
    expect(rank(entries, 'rev')[1]).toMatchObject({
      entry: { name: 'code-review' },
      matched: [5, 6, 7],
    });
    expect(rank(entries, 'rw')[0]?.matched).toEqual([0, 5]);
  });
});
