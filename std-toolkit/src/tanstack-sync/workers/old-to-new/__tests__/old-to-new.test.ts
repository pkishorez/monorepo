import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../../../core/index.js';
import { oldToNew } from '../index.js';

type Item = { id: string };

const entity = (id: string, updated: string): EntityType<Item> => ({
  value: { id },
  meta: { _e: 'Item', _v: 'v1', _u: updated, _d: false },
});

describe('old-to-new', () => {
  it('writes each batch before advancing its cursor', async () => {
    const first = entity('a', '1');
    const second = entity('b', '2');
    const strategy = oldToNew<Item>({
      fetch: ({ cursor }) =>
        Effect.sync(() => {
          events.push(`fetch:${cursor?.value.id ?? 'start'}`);
          return cursor == null ? [first, second] : [];
        }),
    });
    let state = strategy.state.empty;
    const events: string[] = [];

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          yield* strategy.run({
            writeServerTruth: () =>
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
});
