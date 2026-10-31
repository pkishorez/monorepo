import { describe, expect, it } from '@effect/vitest';
import { Duration, Effect, Schema } from 'effect';
import { StdTable } from '../../db/index.js';
import { Memory } from '../../db/memory/index.js';
import { EntityESchema, ESchema, ValueESchema } from '../index.js';

const Payload = ESchema.make('Payload', {
  data: ESchema.fromType<{} | null>(),
}).build();

const encodeFailure = (data: {} | null) =>
  Effect.runSync(
    Schema.encodeEffect(Payload.schema)({ data }).pipe(
      Effect.match({
        onFailure: (error) => error.message,
        onSuccess: () => null,
      }),
    ),
  );

// Index 1 is never assigned: JSON writes it as null.
const sparse = () => {
  const list: number[] = [];
  list[0] = 1;
  list[2] = 3;
  return list;
};

describe('Encoding refuses what JSON cannot hold', () => {
  it.each([
    ['NaN', NaN, /"\/data": NaN is not a JSON number/],
    ['Infinity', [1, -Infinity], /"\/data\/1": -Infinity is not a JSON number/],
    [
      'undefined',
      { a: undefined },
      /"\/data\/a": undefined is not a JSON value/,
    ],
    ['a Date', { at: new Date(0) }, /"\/data\/at": a Date is not a plain JSON/],
    ['a Map', new Map(), /"\/data": a Map is not a plain JSON object/],
    ['a bigint', 1n, /"\/data": a bigint is not a JSON value/],
    ['a sparse array', sparse(), /index 1 is a hole/],
  ])('refuses %s, naming where it is', (_, data, message) => {
    expect(encodeFailure(data)).toMatch(message);
  });

  it('refuses what JSON would drop or replace without saying so', () => {
    const extra = Object.assign([1], { note: Infinity });
    expect(encodeFailure(extra)).toMatch(/array property "note"/);
    const hidden = Object.defineProperty({ a: 1 }, 'secret', { value: 2 });
    expect(encodeFailure(hidden)).toMatch(/non-enumerable property "secret"/);
    const replaced = Object.defineProperty({ a: 1 }, 'toJSON', {
      value: () => ({}),
    });
    expect(encodeFailure(replaced)).toMatch(/toJSON method/);
    expect(encodeFailure({ [Symbol('s')]: 1 })).toMatch(/symbol key/);
  });

  it('accepts an object with no prototype', () => {
    expect(
      encodeFailure(Object.assign(Object.create(null), { a: 1 })),
    ).toBeNull();
  });

  it('refuses a circular reference', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(encodeFailure(loop)).toMatch(/"\/data\/self": a circular reference/);
  });

  it('accepts plain JSON, including a shared non-circular object', () => {
    const shared = { n: 1 };
    expect(
      encodeFailure({ a: shared, b: shared, list: [null, true, 'x', 0] }),
    ).toBeNull();
  });

  it('refuses a conversion that writes a non-finite number', () => {
    const Timer = ESchema.make('Timer', {
      timeout: Schema.DurationFromMillis,
    }).build();
    const result = Effect.runSync(
      Schema.encodeEffect(Timer.schema)({ timeout: Duration.infinity }).pipe(
        Effect.flip,
      ),
    );
    expect(result.message).toMatch(
      /"\/timeout": Infinity is not a JSON number/,
    );
  });

  it('refuses inside a value envelope', () => {
    const Blob = ValueESchema.make(
      'Blob',
      ESchema.fromType<{} | null>(),
    ).build();
    const result = Effect.runSync(
      Schema.encodeEffect(Blob.schema)(NaN).pipe(Effect.flip),
    );
    expect(result.message).toMatch(/Blob value "\/": NaN/);
  });

  it.effect('refuses the write before a table stores it', () => {
    const Note = EntityESchema.make('Note', 'noteId', {
      body: ESchema.fromType<{} | null>(),
    }).build();
    const table = StdTable.make('portable-notes')
      .primary('pk', 'sk')
      .entity(Note, (e) => e.primary())
      .build();
    const notes = table.Note;
    return Effect.gen(function* () {
      const error = yield* notes
        .insert({ noteId: 'n1', body: { score: NaN } })
        .pipe(Effect.flip);
      expect(error.reason._tag).toBe('EncodeFailed');
      expect(String((error.reason as { cause?: unknown }).cause)).toMatch(
        /"\/body\/score": NaN is not a JSON number/,
      );
      expect(yield* notes.get({ noteId: 'n1' })).toBeNull();
      yield* notes.insert({ noteId: 'n1', body: { score: 1 } });
      expect((yield* notes.get({ noteId: 'n1' }))?.value.body).toEqual({
        score: 1,
      });
    }).pipe(Effect.provide(Memory.make(table).layer));
  });
});
