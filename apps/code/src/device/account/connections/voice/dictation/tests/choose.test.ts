import { describe, expect, it } from 'vitest';
import { connectionFor } from '../choose.ts';

/*
 * Which Connection a Dictation is transcribed on: the open Session's, when
 * it is Ready and answers; else the first listed one that is; else none,
 * saying why.
 */

const both = { ready: true, answering: true };

describe('the Connection a Dictation is transcribed on', () => {
  it('is the open Session’s when it can', () => {
    expect(connectionFor({ m1: both, m2: both }, ['m1', 'm2'], 'm2')).toEqual({
      _tag: 'On',
      connectionId: 'm2',
    });
  });

  it('is the first listed one that can, when the open Session’s cannot or none is open', () => {
    const connections = {
      m1: { ready: false, answering: true },
      m2: { ready: true, answering: false },
      m3: both,
    };
    expect(connectionFor(connections, ['m1', 'm2', 'm3'], 'm1')).toEqual({
      _tag: 'On',
      connectionId: 'm3',
    });
    expect(connectionFor(connections, ['m1', 'm2', 'm3'], null)).toEqual({
      _tag: 'On',
      connectionId: 'm3',
    });
  });

  it('is never a Connection no longer listed', () => {
    expect(connectionFor({ gone: both }, ['m1'], 'gone')._tag).toBe('None');
  });

  it('says to turn Speech to Text on when no Connection has it', () => {
    expect(
      connectionFor({ m1: { ready: false, answering: true } }, ['m1'], 'm1'),
    ).toEqual({ _tag: 'None', reason: 'Turn on Speech to Text in Settings' });
    expect(connectionFor({}, [], null)).toEqual({
      _tag: 'None',
      reason: 'Turn on Speech to Text in Settings',
    });
  });

  it('says none answers when those that have it are out of reach', () => {
    expect(
      connectionFor({ m1: { ready: true, answering: false } }, ['m1'], null),
    ).toEqual({
      _tag: 'None',
      reason: 'No Connection with Speech to Text is answering',
    });
  });
});
