import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import type { EncodedItem } from '../../std-table/contract/index.js';
import { StdTableService } from '../../std-table/contract/index.js';
import { StdTable } from '../../std-table/table/index.js';
import { Memory } from '../index.js';

const table = StdTable.make('memory-binding').primary('pk', 'sk').build();
const key = { pk: 'items', sk: 'one' };
const item = (value: string): EncodedItem => ({
  ...key,
  meta: { _e: 'Item', _v: 'v1', _u: value, _d: false },
  data: { nested: { value } },
  keys: {},
});

const write = (value: string) =>
  Effect.flatMap(StdTableService(table.logicalName), ({ contract }) =>
    contract.writeItem({ item: item(value) }),
  );

const read = Effect.flatMap(
  StdTableService(table.logicalName),
  ({ contract }) => contract.getItem(key),
);

describe('Memory adapter table', () => {
  it('keeps state when its layer is provided more than once', async () => {
    const memory = Memory.make(table);

    await Effect.runPromise(write('first').pipe(Effect.provide(memory.layer)));
    const stored = await Effect.runPromise(
      read.pipe(Effect.provide(memory.layer)),
    );

    expect(stored?.meta._u).toBe('first');
  });

  it('isolates state between Memory.make calls', async () => {
    const first = Memory.make(table);
    const second = Memory.make(table);

    await Effect.runPromise(write('first').pipe(Effect.provide(first.layer)));

    expect(
      (await Effect.runPromise(read.pipe(Effect.provide(first.layer))))?.meta
        ._u,
    ).toBe('first');
    expect(
      await Effect.runPromise(read.pipe(Effect.provide(second.layer))),
    ).toBeNull();
  });

  it('uses a nested layer only inside the nested scope', async () => {
    const outer = Memory.make(table);
    const inner = Memory.make(table);
    await Effect.runPromise(write('outer').pipe(Effect.provide(outer.layer)));
    await Effect.runPromise(write('inner').pipe(Effect.provide(inner.layer)));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const before = yield* read;
        const nested = yield* read.pipe(Effect.provide(inner.layer));
        const after = yield* read;
        return [before?.meta._u, nested?.meta._u, after?.meta._u];
      }).pipe(Effect.provide(outer.layer)),
    );

    expect(result).toEqual(['outer', 'inner', 'outer']);
  });

  it('copies values at the write and read boundaries', async () => {
    const memory = Memory.make(table);
    const original = item('original') as {
      data: { nested: { value: string } };
    } & EncodedItem;
    const service = StdTableService(table.logicalName);

    await Effect.runPromise(
      Effect.flatMap(service, ({ contract }) =>
        contract.writeItem({ item: original }),
      ).pipe(Effect.provide(memory.layer)),
    );
    original.data.nested.value = 'mutated-after-write';

    const firstRead = (await Effect.runPromise(
      read.pipe(Effect.provide(memory.layer)),
    )) as typeof original;
    firstRead.data.nested.value = 'mutated-after-read';
    const secondRead = (await Effect.runPromise(
      read.pipe(Effect.provide(memory.layer)),
    )) as typeof original;

    expect(secondRead.data.nested.value).toBe('original');
  });
});
