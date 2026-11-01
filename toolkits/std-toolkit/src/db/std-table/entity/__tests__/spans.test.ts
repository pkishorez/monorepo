import { Effect, Schema, Stream, Tracer } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema, ESchema } from '../../../../eschema/index.js';
import { Memory } from '../../../memory/index.js';
import { StdTable } from '../../table/index.js';

const taskSchema = EntityESchema.make('Task', 'taskId', {
  board: Schema.String,
  title: Schema.String,
}).build();

const settingsSchema = ESchema.make('Settings', {
  theme: Schema.String,
}).build();

const table = StdTable.make('spans-test')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(taskSchema, (e) =>
    e
      .primary({ pk: ['board'] })
      .index('GSI1', 'byBoard', { pk: ['board'], sk: ['title'] }),
  )
  .singleEntity(settingsSchema, { default: { theme: 'light' } })
  .build();

const recording = () => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  return { spans, tracer };
};

const run = <A, E>(
  effect: Effect.Effect<A, E, never>,
  tracer: Tracer.Tracer,
): Promise<A> => Effect.runPromise(effect.pipe(Effect.withTracer(tracer)));

const attributesOf = (span: Tracer.NativeSpan) =>
  Object.fromEntries(span.attributes);

describe('StdTable spans', () => {
  it('records insert and getAndUpdate on a keyed entity', async () => {
    const { spans, tracer } = recording();
    const layer = Memory.make(table).layer;

    await run(
      Effect.gen(function* () {
        yield* table.Task.insert({ taskId: 't1', board: 'b1', title: 'first' });
        yield* table.Task.getAndUpdate(
          { taskId: 't1', board: 'b1' },
          { title: 'second' },
        );
      }).pipe(Effect.provide(layer)),
      tracer,
    );

    const insert = spans.find((span) => span.name === 'StdTable.insert');
    const update = spans.find((span) => span.name === 'StdTable.getAndUpdate');
    expect(insert).toBeDefined();
    expect(update).toBeDefined();
    expect(attributesOf(insert!)).toEqual({ entity: 'Task' });
    expect(attributesOf(update!)).toEqual({
      entity: 'Task',
      taskId: 't1',
      board: 'b1',
    });
    expect(insert!.status._tag).toBe('Ended');
    expect(update!.status._tag).toBe('Ended');
  });

  it('records every keyed entity operation with its key fields', async () => {
    const { spans, tracer } = recording();
    const layer = Memory.make(table).layer;
    const key = { taskId: 't1', board: 'b1' };

    await run(
      Effect.gen(function* () {
        yield* table.Task.insert({ ...key, title: 'first' });
        yield* table.Task.get(key);
        yield* table.Task.query('byBoard', {
          pk: { board: 'b1' },
          beginsWith: { title: '' },
        });
        yield* table.Task.delete(key);
        yield* table.Task.restore(key);
        yield* Stream.runDrain(table.Task.subscribe());
        yield* table.Task.hardDelete(key, 'I KNOW WHAT I AM DOING');
      }).pipe(Effect.provide(layer)),
      tracer,
    );

    const named = Object.fromEntries(
      spans.map((span) => [span.name, attributesOf(span)]),
    );
    expect(named['StdTable.get']).toEqual({ entity: 'Task', ...key });
    expect(named['StdTable.query']).toEqual({
      entity: 'Task',
      pattern: 'byBoard',
    });
    expect(named['StdTable.delete']).toEqual({ entity: 'Task', ...key });
    expect(named['StdTable.restore']).toEqual({ entity: 'Task', ...key });
    expect(named['StdTable.hardDelete']).toEqual({ entity: 'Task', ...key });
    expect(named['StdTable.subscribe']).toEqual({ entity: 'Task' });
  });

  it('records single entity operations', async () => {
    const { spans, tracer } = recording();
    const layer = Memory.make(table).layer;

    await run(
      Effect.gen(function* () {
        yield* table.Settings.get();
        yield* table.Settings.put({ theme: 'dark' });
        yield* table.Settings.getAndUpdate({ theme: 'blue' });
        yield* table.Settings.reset();
      }).pipe(Effect.provide(layer)),
      tracer,
    );

    const names = spans.map((span) => span.name);
    expect(names).toEqual([
      'StdTable.get',
      'StdTable.put',
      'StdTable.getAndUpdate',
      'StdTable.reset',
    ]);
    for (const span of spans)
      expect(attributesOf(span)).toEqual({ entity: 'Settings' });
  });

  it('records table operations', async () => {
    const { spans, tracer } = recording();
    const layer = Memory.make(table).layer;

    await run(
      Effect.gen(function* () {
        const op = yield* table.Task.insertOp({
          taskId: 't1',
          board: 'b1',
          title: 'first',
        });
        yield* table.transact([op]);
        yield* Stream.runCollect(table.scan());
        yield* Stream.runDrain(table.subscribe());
      }).pipe(Effect.provide(layer)),
      tracer,
    );

    const named = Object.fromEntries(
      spans.map((span) => [span.name, attributesOf(span)]),
    );
    expect(named['StdTable.transact']).toEqual({ entity: 'spans-test' });
    expect(named['StdTable.scan']).toEqual({ entity: 'spans-test' });
    expect(named['StdTable.subscribe']).toEqual({ entity: 'spans-test' });
  });
});
