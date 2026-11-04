import { describe, expect, it } from 'vitest';
import { written } from '../actor.ts';

/* What a background command open over the page keeps of what it wrote. */

describe('written', () => {
  const open = {
    jobId: 'j2',
    job: { id: 'j2', kind: 'shell' as const, title: 'pnpm dev' },
    output: [],
    dropped: 0,
    stopped: false,
    run: 1,
  };

  it('keeps each piece a command wrote, in order', () => {
    expect(written(written(open, 1, 'one\n'), 1, 'two\n').output).toEqual([
      'one\n',
      'two\n',
    ]);
  });

  it('drops the oldest pieces past what it keeps, and counts them', () => {
    const big = 'x'.repeat(200 * 1024);
    const kept = written(written(written(open, 1, big), 1, big), 1, 'last\n');
    expect(kept.output).toEqual([big, 'last\n']);
    expect(kept.dropped).toBe(1);
  });

  it('starts again with the first piece of a new read', () => {
    const before = written(written(open, 1, 'one\n'), 1, 'two\n');
    expect(written(before, 2, 'one\ntwo\nthree\n')).toMatchObject({
      run: 2,
      output: ['one\ntwo\nthree\n'],
      dropped: 0,
    });
  });
});
