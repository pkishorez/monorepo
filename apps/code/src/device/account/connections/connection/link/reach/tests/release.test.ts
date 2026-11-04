import { Effect, Layer } from 'effect';
import { CloudClient, VersionGap } from '@kestack/connect/cloud';
import { describe, expect, it } from 'vitest';
import { askStanding, behindAt, behindEach } from '../release.ts';

/*
 * Who is behind when a Connection closed a socket serving another Release
 * of the code Plugin: only Cloud Connect's answer of where this Code's
 * Release stands says, asked afresh, and an answer it cannot give says
 * nothing.
 */

const OURS = 'a'.repeat(64);

/** Where Cloud Connect, as `answer` stands in for it, says `OURS` stands. */
const asked = (answer: (input: unknown) => Effect.Effect<unknown, unknown>) => {
  const seen: Array<unknown> = [];
  return Effect.runPromise(
    askStanding(OURS).pipe(
      Effect.provide(
        Layer.mock(CloudClient)({
          Standing: ((input: unknown) => {
            seen.push(input);
            return answer(input);
          }) as never,
        }),
      ),
    ),
  ).then((standing) => ({ standing, seen }));
};

describe('who is behind', () => {
  it('is the Connection for Latest, this Code for Older, and Cloud Connect for Unknown', () => {
    expect(behindAt('Latest')).toBe('Connection');
    expect(behindAt('Older')).toBe('Code');
    expect(behindAt('Unknown')).toBe('Cloud');
  });

  it('is said for each Connection Cloud Connect answered for, and no other', () => {
    expect(
      behindEach({
        m1: { standing: 'Latest' },
        m2: { standing: 'Older' },
        m3: { standing: null },
      }),
    ).toEqual({ m1: 'Connection', m2: 'Code' });
  });
});

describe('asking Cloud Connect where this Code stands', () => {
  it('asks for the code Plugin at this Code’s Release, and gives its answer', async () => {
    for (const _tag of ['Latest', 'Older', 'Unknown'] as const) {
      const { standing, seen } = await asked(() => Effect.succeed({ _tag }));
      expect(standing).toBe(_tag);
      expect(seen).toEqual([{ plugin: 'code', hash: OURS }]);
    }
  });

  it('takes a Cloud Connect too old to have the call as behind, and an answer too new as this Code behind', async () => {
    expect(
      (await asked(() => Effect.fail(new VersionGap({ older: 'server' }))))
        .standing,
    ).toBe('Unknown');
    expect(
      (await asked(() => Effect.fail(new VersionGap({ older: 'client' }))))
        .standing,
    ).toBe('Older');
  });

  it('says nothing when Cloud Connect cannot be reached', async () => {
    expect(
      (await asked(() => Effect.fail({ _tag: 'RpcClientError' }))).standing,
    ).toBeNull();
  });

  it('says nothing, rather than dying, when the call dies', async () => {
    expect(
      (await asked(() => Effect.die(new Error('handler defect')))).standing,
    ).toBeNull();
  });
});
