import type { Connection } from '@kestack/connect/cloud';
import { describe, expect, it } from 'vitest';
import { behindAll, behindOf } from '../release.ts';

/*
 * Who is behind when a Connection closed a socket running another Release
 * of the code Plugin: what Cloud Connect wants it to run says.
 */

const OURS = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

const wanting = (
  id: string,
  wanted: string | null,
): typeof Connection.Type => ({
  id,
  name: id,
  key: `key-${id}`,
  version: '0.0.5',
  status: { _tag: 'Opening' },
  lastSeen: 0,
  plugins: {},
  wanted:
    wanted === null ? {} : { code: { hash: wanted, url: `file:///${wanted}` } },
  minConnect: null,
});

describe('who is behind', () => {
  it('is the Connection, Updating, while Cloud Connect wants this Code’s Release, or none', () => {
    expect(behindOf(wanting('m1', OURS), OURS)).toBe('Updating');
    expect(behindOf(wanting('m1', null), OURS)).toBe('Updating');
    expect(behindOf(null, OURS)).toBe('Updating');
  });

  it('is this Code, Stale, while Cloud Connect wants another', () => {
    expect(behindOf(wanting('m1', OTHER), OURS)).toBe('Stale');
  });

  it('is said for each Connection that mismatched, and no other', () => {
    expect(
      behindAll(
        [wanting('m1', OURS), wanting('m2', OTHER), wanting('m3', OTHER)],
        { m1: { running: OTHER }, m2: { running: OTHER } },
        OURS,
      ),
    ).toEqual({ m1: 'Updating', m2: 'Stale' });
  });
});
