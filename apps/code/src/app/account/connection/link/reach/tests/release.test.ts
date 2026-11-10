import { Effect, Fiber, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import { CloudClient } from '@kestack/connect/cloud';
import { VersionGap } from '@kestack/rpc-toolkit/rpc/version-gap';
import { describe, expect, it } from 'vitest';
import {
  askStanding,
  behindAll,
  type Mismatch,
  mismatchTold,
  relinkDue,
  relinksSlowly,
  standingAnswered,
} from '../release.ts';

/*
 * Who is behind when a Connection closed a socket running another Release of
 * the code Plugin: only Connect Cloud's answer of where this Code's Release
 * stands says, asked afresh each time, and an answer it cannot give says
 * nothing. Meanwhile, that answer says when the Link dials again.
 */

const OURS = 'a'.repeat(64);
const CLOSE = { running: 'b'.repeat(64) };

const asking = mismatchTold(null, CLOSE)!;

describe('a mismatch', () => {
  it('holds the Link and asks, as a socket closes with one', () => {
    expect(asking).toEqual({
      standing: null,
      asking: true,
      held: true,
      asks: 1,
    });
  });

  it('asks once while an ask is out, and anew once it was answered', () => {
    expect(mismatchTold(asking, CLOSE)).toBe(asking);
    const answered = standingAnswered(asking, 1, { _tag: 'Latest' });
    expect(mismatchTold(answered, CLOSE)).toEqual({
      standing: { _tag: 'Latest' },
      asking: true,
      held: true,
      asks: 2,
    });
  });

  it('ends once a socket is answered, or closes another way', () => {
    expect(mismatchTold(asking, null)).toBeNull();
    expect(mismatchTold(null, null)).toBeNull();
  });

  it('lets the Link go at once when this Code’s Release is Latest', () => {
    const answered = standingAnswered(asking, 1, { _tag: 'Latest' });
    expect(answered?.held).toBe(false);
    expect(relinksSlowly(answered)).toBe(false);
  });

  it('relinks slowly when Connect Cloud is behind, or says nothing', () => {
    for (const standing of [{ _tag: 'Unknown' } as const, null]) {
      const answered = standingAnswered(asking, 1, standing);
      expect(answered?.held).toBe(true);
      expect(relinksSlowly(answered)).toBe(true);
      expect(relinkDue(answered, 1)?.held).toBe(false);
    }
  });

  it('keeps what was said when Connect Cloud then says nothing', () => {
    const latest = standingAnswered(asking, 1, { _tag: 'Latest' });
    const again = mismatchTold(latest, CLOSE);
    expect(standingAnswered(again, 2, null)?.standing).toEqual({
      _tag: 'Latest',
    });
  });

  it('holds the Link for good when this Code is Older', () => {
    const older = standingAnswered(asking, 1, { _tag: 'Older' }) as Mismatch;
    expect(older.held).toBe(true);
    expect(relinksSlowly(older)).toBe(false);
    expect(mismatchTold(older, CLOSE)).toBe(older);
    expect(mismatchTold(older, null)).toBe(older);
  });

  it('ignores an answer, or a wait, of an earlier ask', () => {
    expect(standingAnswered(asking, 7, { _tag: 'Older' })).toBe(asking);
    expect(relinkDue(asking, 7)).toBe(asking);
    expect(standingAnswered(null, 1, { _tag: 'Older' })).toBeNull();
    expect(relinkDue(null, 1)).toBeNull();
  });
});

describe('who is behind', () => {
  it('is said for each Connection Connect Cloud answered for, and no other', () => {
    expect(
      behindAll({
        m1: { standing: { _tag: 'Latest' } },
        m2: { standing: { _tag: 'Older' } },
        m3: { standing: { _tag: 'Unknown' } },
        m4: { standing: null },
      }),
    ).toEqual({ m1: 'Updating', m2: 'Stale', m3: 'Updating' });
  });
});

/** Where Connect Cloud, as `answer` stands in for it, says `OURS` stands. */
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

describe('asking Connect Cloud where this Code stands', () => {
  it('asks for the code Plugin at this Code’s Release, and gives its answer', async () => {
    for (const _tag of ['Latest', 'Older', 'Unknown'] as const) {
      const { standing, seen } = await asked(() => Effect.succeed({ _tag }));
      expect(standing).toEqual({ _tag });
      expect(seen).toEqual([{ plugin: 'code', hash: OURS }]);
    }
  });

  it('takes one too old to have the call as behind, and an answer too new as this Code behind', async () => {
    expect(
      (await asked(() => Effect.fail(new VersionGap({ older: 'server' }))))
        .standing,
    ).toEqual({ _tag: 'Unknown' });
    expect(
      (await asked(() => Effect.fail(new VersionGap({ older: 'client' }))))
        .standing,
    ).toEqual({ _tag: 'Older' });
  });

  it('says nothing, rather than holding the Link for good, when the call never ends', async () => {
    const standing = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const asking = yield* Effect.forkScoped(askStanding(OURS));
          yield* Effect.yieldNow;
          yield* TestClock.adjust('1 minute');
          return yield* Fiber.join(asking);
        }),
      ).pipe(
        Effect.provide(
          Layer.mock(CloudClient)({ Standing: (() => Effect.never) as never }),
        ),
        Effect.provide(TestClock.layer()),
      ),
    );
    expect(standing).toBeNull();
  });

  it('says nothing when it cannot be reached, or the call dies', async () => {
    expect(
      (await asked(() => Effect.fail({ _tag: 'RpcClientError' }))).standing,
    ).toBeNull();
    expect(
      (await asked(() => Effect.die(new Error('handler defect')))).standing,
    ).toBeNull();
  });
});
