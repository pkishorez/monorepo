import { Effect, Fiber, Schedule, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import type { DecodedEntity } from '../../../../core/index.js';
import { oldToNew } from '../index.js';

type Item = { id: string };

const flow = {
  log: () => Effect.void,
  state: () => Effect.void,
  withSpan:
    () =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect,
};

const entity = (id: string, updated: string): DecodedEntity<Item> => ({
  value: { id },
  meta: { _e: 'Item', _u: updated, _d: false },
});

describe('old-to-new', () => {
  it('writes each batch before advancing its cursor', async () => {
    const first = entity('a', '1');
    const second = entity('b', '2');
    const strategy = oldToNew<Item>({
      source: ({ paginated }) =>
        paginated({
          fetch: ({ cursor }) =>
            Effect.sync(() => {
              events.push(`fetch:${cursor?.value.id ?? 'start'}`);
              return cursor == null ? [first, second] : [];
            }),
        }),
    });
    let state = strategy.state.empty;
    const events: string[] = [];

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          yield* strategy.run({
            flow,
            applyToSyncReplica: () =>
              Effect.sync(() => {
                events.push('write');
              }),
            getState: Effect.sync(() => state),
            setState: (next) =>
              Effect.sync(() => {
                const value = next.cursor?.value as Item | undefined;
                events.push(`state:${value?.id ?? 'empty'}`);
                state = next;
              }),
            scope,
          });
        }),
      ),
    );

    expect(events).toEqual(['fetch:start', 'write', 'state:b', 'fetch:b']);
  });

  it('stops paging when an inclusive backend stops advancing the cursor', async () => {
    const first = entity('a', '1');
    const second = entity('b', '2');
    const all = [first, second];
    const fetches: string[] = [];
    const strategy = oldToNew<Item>({
      source: ({ paginated }) =>
        paginated({
          fetch: ({ cursor }) =>
            Effect.sync(() => {
              fetches.push(cursor?.value.id ?? 'start');
              if (fetches.length > 10) throw new Error('paged forever');
              return cursor == null
                ? all
                : all.filter((item) => item.meta._u >= cursor.meta._u);
            }),
        }),
    });
    let state = strategy.state.empty;

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          yield* strategy.run({
            flow,
            applyToSyncReplica: () => Effect.void,
            getState: Effect.sync(() => state),
            setState: (next) =>
              Effect.sync(() => {
                state = next;
              }),
            scope,
          });
        }),
      ),
    );

    expect(fetches).toEqual(['start', 'b']);
  });

  it('drains a finite live source and advances state per batch', async () => {
    const first = entity('a', '1');
    const second = entity('b', '2');
    const strategy = oldToNew<Item>({
      source: ({ live }) =>
        live({ open: () => Stream.make([first], [second]) }),
    });
    const written: string[] = [];
    let state = strategy.state.empty;

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          yield* strategy.run({
            flow,
            applyToSyncReplica: (entities) =>
              Effect.sync(() => {
                written.push(...entities.map((item) => item.value.id));
              }),
            getState: Effect.sync(() => state),
            setState: (next) =>
              Effect.sync(() => {
                state = next;
              }),
            scope,
          });
        }),
      ),
    );

    expect(written).toEqual(['a', 'b']);
    expect((state.cursor?.value as Item | undefined)?.id).toBe('b');
  });

  it('polls immediately and retains its cursor across an empty response', async () => {
    const first = entity('a', '1');
    const cursors: Array<string | null> = [];
    let request = 0;
    const strategy = oldToNew<Item>({
      source: ({ poll }) =>
        poll({
          fetch: ({ cursor }) =>
            Effect.sync(() => {
              cursors.push(cursor?.value.id ?? null);
              request += 1;
              return request === 1 ? [first] : [];
            }),
          schedule: Schedule.spaced('1 second').pipe(
            Schedule.upTo({ times: 1 }),
          ),
        }),
    });
    let state = strategy.state.empty;

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          const fiber = yield* Effect.forkChild(
            strategy.run({
              flow,
              applyToSyncReplica: () => Effect.void,
              getState: Effect.sync(() => state),
              setState: (next) =>
                Effect.sync(() => {
                  state = next;
                }),
              scope,
            }),
          );
          yield* TestClock.adjust('1 second');
          yield* Fiber.join(fiber);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    );

    expect(cursors).toEqual([null, 'a']);
  });
});
