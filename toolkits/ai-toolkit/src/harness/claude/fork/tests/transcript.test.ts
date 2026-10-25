import { describe, expect, it } from 'vitest';
import { resolveEntry, type Entry } from '../transcript.js';

const sessions: Record<string, ReadonlyArray<Entry>> = {
  original: [{ uuid: 'o1' }, { uuid: 'o2' }, { uuid: 'o3' }],
  fork: [
    { uuid: 'f1', forkedFrom: { sessionId: 'original', messageUuid: 'o1' } },
    { uuid: 'f2', forkedFrom: { sessionId: 'original', messageUuid: 'o2' } },
    { uuid: 'f4' },
  ],
  forkOfFork: [
    { uuid: 'g1', forkedFrom: { sessionId: 'fork', messageUuid: 'f1' } },
    { uuid: 'g2', forkedFrom: { sessionId: 'fork', messageUuid: 'f2' } },
    { uuid: 'g4', forkedFrom: { sessionId: 'fork', messageUuid: 'f4' } },
  ],
};
const read = (id: string) => sessions[id] ?? [];

describe('resolveEntry', () => {
  it('finds an entry of the session itself', () => {
    expect(resolveEntry('fork', 'f4', read)).toBe('f4');
  });

  it('finds the copy of an entry from the session it was forked from', () => {
    expect(resolveEntry('fork', 'o2', read)).toBe('f2');
  });

  it('follows forks of forks back to the session that wrote the entry', () => {
    expect(resolveEntry('forkOfFork', 'o1', read)).toBe('g1');
    expect(resolveEntry('forkOfFork', 'f4', read)).toBe('g4');
  });

  it('is undefined for an entry the fork did not copy', () => {
    expect(resolveEntry('fork', 'o3', read)).toBe(undefined);
    expect(resolveEntry('original', 'nope', read)).toBe(undefined);
  });
});
