import { describe, expect, it } from 'vitest';
import { makePool } from '../src/feedback/pool';

const recorder = () => {
  const log: Array<string> = [];
  let made = 0;
  const load = (name: string) => {
    const id = `${name}#${made++}`;
    return {
      restart: () => log.push(`play ${id}`),
      release: () => log.push(`release ${id}`),
    };
  };
  return { log, load };
};

describe('sound pool', () => {
  it('loads every voice up front', () => {
    const { log, load } = recorder();
    let loads = 0;
    makePool(['tick', 'lock'], 3, (name) => (loads++, load(name)));
    expect(loads).toBe(6);
    expect(log).toEqual([]);
  });

  it('takes the voices of a sound in turn', () => {
    const { log, load } = recorder();
    const pool = makePool(['tick'], 2, load);
    pool.play('tick');
    pool.play('tick');
    pool.play('tick');
    expect(log).toEqual(['play tick#0', 'play tick#1', 'play tick#0']);
  });

  it('releases every voice once, then plays nothing', () => {
    const { log, load } = recorder();
    const pool = makePool(['tick', 'lock'], 1, load);
    pool.release();
    pool.play('tick');
    expect(log).toEqual(['release tick#0', 'release lock#1']);
  });
});
