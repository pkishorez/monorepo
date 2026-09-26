import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, EntityESchema, findOutdatedVersion } from '../index.js';

const counter = EntityESchema.make('Counter', 'id', {
  count: Schema.Number,
})
  .evolve('v2', { label: Schema.String }, (previous) => ({
    ...previous,
    label: `count-${previous.count}`,
  }))
  .build();

const serializedV1 = {
  value: { id: 'one', count: 2 },
  meta: { _e: 'Counter', _v: 'v1', _u: '1', _d: false },
} as const;

const decode = (input: unknown) =>
  Schema.decodeUnknownEffect(counter.entity)(input);
const encode = Schema.encodeEffect(counter.entity);

describe('entity', () => {
  it('migrates an older entity and sets _v to the latest version', async () => {
    const migrated = await Effect.runPromise(decode(serializedV1));

    expect(migrated).toEqual({
      value: { id: 'one', count: 2, label: 'count-2' },
      meta: { _e: 'Counter', _v: 'v2', _u: '1', _d: false },
    });
    expect(migrated.value).not.toHaveProperty('_v');
  });

  it('writes an entity at the latest version with _v in meta', async () => {
    const migrated = await Effect.runPromise(decode(serializedV1));
    const serialized = await Effect.runPromise(encode(migrated));

    expect(serialized).toEqual({
      value: { id: 'one', count: 2, label: 'count-2' },
      meta: { _e: 'Counter', _v: 'v2', _u: '1', _d: false },
    });
  });

  it('is the same schema every time it is read', () => {
    expect(counter.entity).toBe(counter.entity);
  });

  it('requires _v in Entity Meta', async () => {
    const result = await Effect.runPromise(
      decode({
        value: { id: 'one', count: 2, label: 'count-2' },
        meta: { _e: 'Counter', _u: '1', _d: false },
      }).pipe(Effect.result),
    );

    expect(result._tag).toBe('Failure');
  });

  it('keeps OutdatedVersion findable for a version newer than the reader knows', async () => {
    const exit = await Effect.runPromiseExit(
      decode({ ...serializedV1, meta: { ...serializedV1.meta, _v: 'v3' } }),
    );

    expect(findOutdatedVersion(exit)?.version).toBe('v3');
  });

  it('refuses an entity whose _v is not the latest version', async () => {
    const encodeAt = (_v: string) =>
      Effect.runPromise(
        encode({
          value: { id: 'one', count: 2, label: 'x' },
          meta: { _e: 'Counter', _v, _u: '1', _d: false },
        }).pipe(Effect.flip),
      );

    expect(findOutdatedVersion(await encodeAt('v3'))?.version).toBe('v3');
    expect(findOutdatedVersion(await encodeAt('v1'))).toBeUndefined();
  });

  it('refuses an Entity without _v', async () => {
    const result = await Effect.runPromise(
      Effect.result(
        encode({
          value: { id: 'one', count: 2, label: 'two' },
          meta: { _e: 'Counter', _u: '1', _d: false },
        } as never),
      ),
    );
    expect(result._tag).toBe('Failure');
  });

  it('carries a converted field across a JSON boundary', async () => {
    const Task = EntityESchema.make('Task', 'taskId', {
      dueAt: Schema.DateFromString,
    }).build();
    const dueAt = new Date('2026-09-01T09:00:00.000Z');
    const entity = {
      value: { taskId: 't1', dueAt },
      meta: { _e: 'Task', _v: 'v1', _u: '1', _d: false },
    };
    const wire = JSON.parse(
      JSON.stringify(
        await Effect.runPromise(Schema.encodeEffect(Task.entity)(entity)),
      ),
    );
    expect(wire.value).toEqual({
      taskId: 't1',
      dueAt: '2026-09-01T09:00:00.000Z',
    });
    const received = await Effect.runPromise(
      Schema.decodeUnknownEffect(Task.entity)(wire),
    );
    expect(received.value.dueAt).toBeInstanceOf(Date);
    expect(received.value.dueAt.getTime()).toBe(dueAt.getTime());
  });
});

describe('plain ESchema', () => {
  const Settings = ESchema.make('Settings', { theme: Schema.String })
    .evolve('v2', { dense: Schema.Boolean }, (previous) => ({
      ...previous,
      dense: false,
    }))
    .build();

  it('has an entity with full Entity Meta', async () => {
    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(Settings.entity)({
        value: { theme: 'dark' },
        meta: { _e: 'Settings', _v: 'v1', _u: '1', _d: false },
      }),
    );
    expect(decoded).toEqual({
      value: { theme: 'dark', dense: false },
      meta: { _e: 'Settings', _v: 'v2', _u: '1', _d: false },
    });
  });

  it('has a singleEntity with SingleEntity meta', async () => {
    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(Settings.singleEntity)({
        value: { theme: 'dark' },
        meta: { _e: 'Settings', _v: 'v1', _u: '1' },
      }),
    );
    expect(decoded).toEqual({
      value: { theme: 'dark', dense: false },
      meta: { _e: 'Settings', _v: 'v2', _u: '1' },
    });
    const encoded = await Effect.runPromise(
      Schema.encodeEffect(Settings.singleEntity)(decoded),
    );
    expect(encoded).toEqual({
      value: { theme: 'dark', dense: false },
      meta: { _e: 'Settings', _v: 'v2', _u: '1' },
    });
  });
});
