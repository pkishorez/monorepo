import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema, OutdatedVersion } from '../../eschema/index.js';
import { EntitySchema, findOutdatedVersion } from '../entity-schema/index.js';

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

describe('EntitySchema', () => {
  it('migrates an older entity and sets _v to the latest version', async () => {
    const migrated = await Effect.runPromise(
      EntitySchema(counter).decode(serializedV1),
    );

    expect(migrated).toEqual({
      value: { id: 'one', count: 2, label: 'count-2' },
      meta: { _e: 'Counter', _v: 'v2', _u: '1', _d: false },
    });
    expect(migrated.value).not.toHaveProperty('_v');
  });

  it('writes an entity at the latest version with _v in meta', async () => {
    const entitySchema = EntitySchema(counter);
    const migrated = await Effect.runPromise(entitySchema.decode(serializedV1));
    const serialized = await Effect.runPromise(entitySchema.encode(migrated));

    expect(serialized).toEqual({
      value: { id: 'one', count: 2, label: 'count-2' },
      meta: { _e: 'Counter', _v: 'v2', _u: '1', _d: false },
    });
  });

  it('works as an Effect Schema codec for transport integrations', async () => {
    const entitySchema = EntitySchema(counter);
    const migrated = await Effect.runPromise(
      Schema.decodeUnknownEffect(entitySchema)(serializedV1),
    );
    const serialized = await Effect.runPromise(
      Schema.encodeEffect(entitySchema)(migrated),
    );

    expect(migrated.value.count).toBe(2);
    expect(serialized.meta._v).toBe('v2');
    expect(serialized.value).not.toHaveProperty('_v');
  });

  it('requires _v in Entity Meta', async () => {
    const result = await Effect.runPromise(
      EntitySchema(counter)
        .decode({
          value: { id: 'one', count: 2, label: 'count-2' },
          meta: { _e: 'Counter', _u: '1', _d: false },
        })
        .pipe(Effect.result),
    );

    expect(result._tag).toBe('Failure');
  });

  it('fails with OutdatedVersion for a version newer than the reader knows', async () => {
    const error = await Effect.runPromise(
      EntitySchema(counter)
        .decode({ ...serializedV1, meta: { ...serializedV1.meta, _v: 'v3' } })
        .pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(OutdatedVersion);
  });

  it('keeps OutdatedVersion findable through an Effect Schema failure', async () => {
    const exit = await Effect.runPromiseExit(
      Schema.decodeUnknownEffect(EntitySchema(counter))({
        ...serializedV1,
        meta: { ...serializedV1.meta, _v: 'v3' },
      }),
    );

    expect(findOutdatedVersion(exit)?.version).toBe('v3');
  });
});

describe('EntitySchema.encode', () => {
  it('refuses an entity whose _v is not the latest version', async () => {
    const encode = (_v: string) =>
      Effect.runPromise(
        EntitySchema(counter)
          .encode({
            value: { id: 'one', count: 2, label: 'x' },
            meta: { _e: 'Counter', _v, _u: '1', _d: false },
          })
          .pipe(Effect.flip),
      );

    expect(await encode('v3')).toBeInstanceOf(OutdatedVersion);
    expect((await encode('v1'))._tag).toBe('ESchemaError');
  });

  it('carries a converted field across a JSON boundary', async () => {
    const Task = EntityESchema.make('Task', 'taskId', {
      dueAt: Schema.DateFromString,
    }).build();
    const TaskEntity = EntitySchema(Task);
    const dueAt = new Date('2026-09-01T09:00:00.000Z');
    const entity = {
      value: { taskId: 't1', dueAt },
      meta: { _e: 'Task', _v: 'v1', _u: '1', _d: false },
    };
    const wire = JSON.parse(
      JSON.stringify(
        await Effect.runPromise(Schema.encodeEffect(TaskEntity)(entity)),
      ),
    );
    expect(wire.value).toEqual({
      taskId: 't1',
      dueAt: '2026-09-01T09:00:00.000Z',
    });
    const received = await Effect.runPromise(
      Schema.decodeUnknownEffect(TaskEntity)(wire),
    );
    expect(received.value.dueAt).toBeInstanceOf(Date);
    expect(received.value.dueAt.getTime()).toBe(dueAt.getTime());
  });

  it('refuses an Entity without _v through both ways of encoding', async () => {
    const codec = EntitySchema(counter);
    const withoutVersion = {
      value: { id: 'one', count: 2, label: 'two' },
      meta: { _e: 'Counter', _u: '1', _d: false },
    };
    const direct = await Effect.runPromise(
      Effect.result(codec.encode(withoutVersion as never)),
    );
    const throughSchema = await Effect.runPromise(
      Effect.result(Schema.encodeEffect(codec)(withoutVersion as never)),
    );
    expect(direct._tag).toBe('Failure');
    expect(throughSchema._tag).toBe('Failure');

    const latest = {
      ...withoutVersion,
      meta: { ...withoutVersion.meta, _v: 'v2' },
    };
    expect(await Effect.runPromise(codec.encode(latest))).toEqual(
      await Effect.runPromise(Schema.encodeEffect(codec)(latest)),
    );
  });
});
