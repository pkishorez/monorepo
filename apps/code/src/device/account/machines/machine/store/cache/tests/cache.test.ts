import { Effect, Fiber, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { copying, Cache, shelf } from '../index.ts';
import { memory } from '../store.ts';

/*
 * The kept foundation: a copy kept shows first and is asked again behind;
 * the answer to the latest ask shows and is kept, and one to an ask made
 * before a later ask or a change made here is dropped; a copy kept at
 * another version reads as nothing; each copy is kept in the table of its
 * kind, in the database of whose it is; what a Project removed went is
 * deleted, a row just made by a write under way too, and a write asked
 * before a Project or a Machine went is not made.
 */

const Setup = shelf('setup', 1, Schema.Array(Schema.String));
const SetupNext = shelf('setup', 2, Schema.Array(Schema.String));
const Skills = shelf('skills', 1, Schema.Array(Schema.String));
const List = shelf('machines', 1, Schema.Array(Schema.String));

const a1m1 = { accountId: 'a1', machineId: 'm1', projectId: null };
const a1m2 = { accountId: 'a1', machineId: 'm2', projectId: null };
const a2m1 = { accountId: 'a2', machineId: 'm1', projectId: null };
const a1m1p1 = { accountId: 'a1', machineId: 'm1', projectId: 'p1' };
const a1m1p2 = { accountId: 'a1', machineId: 'm1', projectId: 'p2' };
const a1m2p1 = { accountId: 'a1', machineId: 'm2', projectId: 'p1' };
const a1 = { accountId: 'a1', machineId: null, projectId: null };
const a2 = { accountId: 'a2', machineId: null, projectId: null };

const run = <A>(effect: Effect.Effect<A, unknown, Cache>) =>
  Effect.runPromise(Effect.provide(effect, memory()) as Effect.Effect<A>);

describe('Cache', () => {
  it('reads what was written, each copy under its own name', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Cache;
        expect(yield* kept.read(Setup, a1m1)).toBeNull();
        yield* kept.write(Setup, a1m1, ['one']);
        yield* kept.write(Setup, a1m1, ['two']);
        yield* kept.write(Skills, a1m1p1, ['three']);
        expect(yield* kept.read(Setup, a1m1)).toEqual(['two']);
        expect(yield* kept.read(Skills, a1m1p1)).toEqual(['three']);
      }),
    ));

  it('keeps each copy apart in the database of whose it is', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Cache;
        yield* kept.write(List, a1, ['a1']);
        yield* kept.write(List, a2, ['a2']);
        yield* kept.write(Setup, a1m1, ['a1 m1']);
        yield* kept.write(Setup, a1m2, ['a1 m2']);
        yield* kept.write(Setup, a2m1, ['a2 m1']);
        expect(yield* kept.read(List, a1)).toEqual(['a1']);
        expect(yield* kept.read(List, a2)).toEqual(['a2']);
        expect(yield* kept.read(Setup, a1m1)).toEqual(['a1 m1']);
        expect(yield* kept.read(Setup, a1m2)).toEqual(['a1 m2']);
        expect(yield* kept.read(Setup, a2m1)).toEqual(['a2 m1']);
      }),
    ));

  it('reads a copy kept at another version as nothing', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Cache;
        yield* kept.write(Setup, a1m1, ['old']);
        expect(yield* kept.read(SetupNext, a1m1)).toBeNull();
        yield* kept.write(SetupNext, a1m1, ['new']);
        expect(yield* kept.read(SetupNext, a1m1)).toEqual(['new']);
      }),
    ));

  it('drops a Project removed, and no other', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Cache;
        for (const whose of [a1m1p1, a1m1p2, a1m2p1])
          yield* kept.write(Skills, whose, ['x']);
        yield* kept.write(Setup, a1m1, ['x']);
        yield* kept.drop({
          _tag: 'Project',
          accountId: 'a1',
          machineId: 'm1',
          projectId: 'p1',
        });
        expect(yield* kept.read(Skills, a1m1p1)).toBeNull();
        expect(yield* kept.read(Skills, a1m1p2)).toEqual(['x']);
        expect(yield* kept.read(Skills, a1m2p1)).toEqual(['x']);
        expect(yield* kept.read(Setup, a1m1)).toEqual(['x']);
      }),
    ));

  it('makes no write asked as a Machine went', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Cache;
        yield* Effect.all(
          [
            kept.write(Setup, a1m1, ['late']),
            kept.drop({ _tag: 'Machine', accountId: 'a1', machineId: 'm1' }),
          ],
          { concurrency: 'unbounded' },
        );
        expect(yield* kept.read(Setup, a1m1)).toBeNull();
        yield* kept.write(Setup, a1m2, ['kept']);
        expect(yield* kept.read(Setup, a1m2)).toEqual(['kept']);
      }),
    ));

  it('drops a row a write under way makes, once it is made', () =>
    run(
      Effect.gen(function* () {
        const kept = yield* Cache;
        const writing = yield* Effect.forkChild(
          kept.write(Skills, a1m1p1, ['under way']),
        );
        yield* Effect.yieldNow;
        yield* kept.drop({
          _tag: 'Project',
          accountId: 'a1',
          machineId: 'm1',
          projectId: 'p1',
        });
        yield* Fiber.join(writing);
        expect(yield* kept.read(Skills, a1m1p1)).toBeNull();
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
