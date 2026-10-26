import { Effect, Fiber, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { copying, Kept, shelf, went } from '../../capabilities/index.ts';
import { memory } from './kept.ts';

/*
 * The kept foundation: a copy kept shows first and is asked again behind;
 * the answer to the latest ask shows and is kept, and one to an ask made
 * before a later ask or a change made here is dropped; a copy kept at
 * another version reads as nothing; what went is deleted, a row just
 * made by a write under way too, and a write asked before it went is not
 * made.
 */

const Names = shelf('names', 1, Schema.Array(Schema.String));
const NamesNext = shelf('names', 2, Schema.Array(Schema.String));

const a1m1 = { accountId: 'a1', machineId: 'm1', projectId: null };
const a1m2 = { accountId: 'a1', machineId: 'm2', projectId: null };
const a1p1 = { accountId: 'a1', machineId: 'm1', projectId: 'p1' };
const a1 = { accountId: 'a1', machineId: null, projectId: null };
const a2 = { accountId: 'a2', machineId: null, projectId: null };

const run = <A>(effect: Effect.Effect<A, unknown, Kept>) =>
  Effect.runPromise(Effect.provide(effect, memory()) as Effect.Effect<A>);

describe('Kept', () => {
  it('reads what was written, each copy under its own name', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Kept;
        expect(yield* kept.read(Names, a1m1)).toBeNull();
        yield* kept.write(Names, a1m1, ['one']);
        yield* kept.write(Names, a1m1, ['two']);
        yield* kept.write(Names, a1p1, ['three']);
        expect(yield* kept.read(Names, a1m1)).toEqual(['two']);
        expect(yield* kept.read(Names, a1p1)).toEqual(['three']);
      }),
    ));

  it('reads a copy kept at another version as nothing', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Kept;
        yield* kept.write(Names, a1m1, ['old']);
        expect(yield* kept.read(NamesNext, a1m1)).toBeNull();
        yield* kept.write(NamesNext, a1m1, ['new']);
        expect(yield* kept.read(NamesNext, a1m1)).toEqual(['new']);
      }),
    ));

  it('drops what went, and no other', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Kept;
        for (const whose of [a1m1, a1m2, a1p1, a1, a2])
          yield* kept.write(Names, whose, ['x']);
        yield* kept.drop({ _tag: 'Project', machineId: 'm1', projectId: 'p1' });
        expect(yield* kept.read(Names, a1p1)).toBeNull();
        expect(yield* kept.read(Names, a1m1)).not.toBeNull();
        yield* kept.drop({ _tag: 'Unlisted', accountId: 'a1', listed: ['m2'] });
        expect(yield* kept.read(Names, a1m1)).toBeNull();
        expect(yield* kept.read(Names, a1m2)).not.toBeNull();
        // The Account's own list is of no Machine: unlisting keeps it.
        expect(yield* kept.read(Names, a1)).not.toBeNull();
        yield* kept.drop({ _tag: 'SignedOut', signedIn: ['a2'] });
        expect(yield* kept.read(Names, a1)).toBeNull();
        expect(yield* kept.read(Names, a1m2)).toBeNull();
        expect(yield* kept.read(Names, a2)).toEqual(['x']);
      }),
    ));

  it('keeps nothing of what went, a write asked as it went too', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Kept;
        yield* Effect.all(
          [
            kept.write(Names, a1m1, ['late']),
            kept.drop({ _tag: 'Machine', accountId: 'a1', machineId: 'm1' }),
          ],
          { concurrency: 'unbounded' },
        );
        expect(yield* kept.read(Names, a1m1)).toBeNull();
        yield* kept.write(Names, a1m2, ['kept']);
        expect(yield* kept.read(Names, a1m2)).toEqual(['kept']);
      }),
    ));

  it('drops a row a write under way makes, once it is made', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Kept;
        const writing = yield* Effect.forkChild(
          kept.write(Names, a1m1, ['under way']),
        );
        yield* Effect.yieldNow;
        yield* kept.drop({ _tag: 'Machine', accountId: 'a1', machineId: 'm1' });
        yield* Fiber.join(writing);
        expect(yield* kept.read(Names, a1m1)).toBeNull();
      }),
    ));
});

describe('copying', () => {
  it('shows the kept copy, asks once it is read, and shows the answer', () => {
    const held = copying.empty;
    expect(copying.asking(held)).toEqual([]);
    const saved = copying.read(held, ['saved']);
    expect(saved.value).toEqual(['saved']);
    expect(copying.asking(saved)).toEqual(['1']);
    const answered = copying.answered(saved, 1, ['fresh']);
    expect(answered.value).toEqual(['fresh']);
    expect(copying.asking(answered)).toEqual([]);
    expect(copying.asking(copying.ask(answered))).toEqual(['2']);
  });

  it('keeps an answer that came before the kept copy', () => {
    const answered = copying.answered(copying.empty, 1, ['fresh']);
    expect(copying.read(answered, ['saved']).value).toEqual(['fresh']);
  });

  it('drops an answer to an ask made before a change, and asks again', () => {
    const asked = copying.read(copying.empty, ['a']);
    const changed = copying.changed(asked, ['a', 'b']);
    expect(copying.latest(changed, 1)).toBe(false);
    expect(copying.answered(changed, 1, ['a'])).toBe(changed);
    expect(copying.asking(changed)).toEqual(['2']);
    expect(copying.answered(changed, 2, ['a', 'b', 'c']).value).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('says why an ask was refused, until one is answered, and keeps what shows', () => {
    const asked = copying.read(copying.empty, ['a']);
    const refused = copying.refused(asked, 1, 'offline');
    expect(refused).toMatchObject({ value: ['a'], problem: 'offline' });
    expect(copying.asking(refused)).toEqual([]);
    const again = copying.ask(refused);
    expect(copying.answered(again, 2, ['b']).problem).toBeNull();
  });
});

describe('went', () => {
  it('takes a row kept before rows named their Account only with its Machine', () => {
    const before = { accountId: null, machineId: 'm1', projectId: null };
    expect(went({ _tag: 'SignedOut', signedIn: [] })(before)).toBe(false);
    expect(
      went({ _tag: 'Unlisted', accountId: 'a1', listed: [] })(before),
    ).toBe(false);
    expect(
      went({ _tag: 'Machine', accountId: 'a1', machineId: 'm1' })(before),
    ).toBe(true);
  });
});
