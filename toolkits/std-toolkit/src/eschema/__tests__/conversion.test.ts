import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { readEncoded, writeEncoded } from '../domain/encoded/index.js';
import { EntityESchema, ESchema, ValueESchema, toSchema } from '../index.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

const due = new Date('2026-09-01T09:00:00.000Z');

describe('field conversions', () => {
  itEffect('stores the encoded side and hands back the value', () =>
    Effect.gen(function* () {
      const Task = EntityESchema.make('Task', 'taskId', {
        dueAt: Schema.DateFromString,
        size: Schema.BigIntFromString,
        note: Schema.OptionFromNullOr(Schema.String),
      }).build();

      const encoded = yield* writeEncoded(Task, {
        taskId: 't1',
        dueAt: due,
        size: 12n,
        note: Option.none(),
      });
      expect(encoded).toEqual({
        _v: 'v1',
        taskId: 't1',
        dueAt: '2026-09-01T09:00:00.000Z',
        size: '12',
        note: null,
      });

      const value = yield* readEncoded(Task, encoded);
      expect(value.dueAt).toBeInstanceOf(Date);
      expect(value.dueAt.getTime()).toBe(due.getTime());
      expect(value.size).toBe(12n);
      expect(Option.isNone(value.note)).toBe(true);
    }),
  );

  itEffect('migrates values after each version converts its own fields', () =>
    Effect.gen(function* () {
      const Task = EntityESchema.make('Task', 'taskId', {
        dueText: Schema.String,
      })
        .evolve(
          'v2',
          { dueText: null, dueAt: Schema.DateFromString },
          (v1) => ({
            taskId: v1.taskId,
            dueAt: new Date(v1.dueText),
          }),
        )
        .evolve(
          'v3',
          { doneAt: Schema.NullOr(Schema.DateFromString) },
          (v2) => ({
            ...v2,
            doneAt: v2.dueAt.getTime() > 0 ? null : v2.dueAt,
          }),
        )
        .build();

      const fromV1 = yield* readEncoded(Task, {
        _v: 'v1',
        taskId: 't1',
        dueText: '2026-09-01T09:00:00.000Z',
      });
      expect(fromV1.dueAt.getTime()).toBe(due.getTime());
      expect(fromV1.doneAt).toBeNull();

      const fromV2 = yield* readEncoded(Task, {
        _v: 'v2',
        taskId: 't1',
        dueAt: '2026-09-01T09:00:00.000Z',
      });
      expect(fromV2.dueAt).toBeInstanceOf(Date);
    }),
  );

  itEffect('keeps conversions of a nested ESchema and a ValueESchema', () =>
    Effect.gen(function* () {
      const Window = ESchema.make('Window', {
        from: Schema.DateFromString,
      }).build();
      const Deadline = ValueESchema.make(
        'Deadline',
        Schema.DateFromString,
      ).build();
      const Task = EntityESchema.make('Task', 'taskId', {
        window: toSchema(Window),
        deadline: toSchema(Deadline),
      }).build();

      const encoded = yield* writeEncoded(Task, {
        taskId: 't1',
        window: { from: due },
        deadline: due,
      });
      expect(encoded).toEqual({
        _v: 'v1',
        taskId: 't1',
        window: { _v: 'v1', from: '2026-09-01T09:00:00.000Z' },
        deadline: { _v: 'v1', _value: '2026-09-01T09:00:00.000Z' },
      });
      const value = yield* readEncoded(Task, encoded);
      expect(value.window.from).toBeInstanceOf(Date);
      expect(value.deadline).toBeInstanceOf(Date);
    }),
  );

  it('still refuses filters, defaults, and non-JSON encoded sides', () => {
    expect(() =>
      EntityESchema.make('Task', 'taskId', {
        title: Schema.String.check(Schema.isMinLength(1)),
      }).build(),
    ).toThrow(/filter/);
    expect(() =>
      EntityESchema.make('Task', 'taskId', { dueAt: Schema.Date }).build(),
    ).toThrow(/declaration/);
    expect(() =>
      EntityESchema.make('Task', 'taskId', {
        at: Schema.DateTimeUtcFromDate,
      }).build(),
    ).toThrow(/declaration/);
  });

  it('validates the value side through Standard Schema', () => {
    const Task = EntityESchema.make('Task', 'taskId', {
      dueAt: Schema.DateFromString,
    }).build();
    expect(
      'value' in Task['~standard'].validate({ taskId: 't1', dueAt: due }),
    ).toBe(true);
    expect(
      'issues' in
        Task['~standard'].validate({
          taskId: 't1',
          dueAt: '2026-09-01T09:00:00.000Z',
        }),
    ).toBe(true);
  });
});
