import { Effect } from 'effect';
import { expect, it } from 'vitest';
import { inOrder } from '../std-sync/in-order.js';

// A write that takes `ms` and notes when it ran.
const write = (log: Array<string>, name: string, ms: number) =>
  Effect.sleep(ms).pipe(Effect.andThen(Effect.sync(() => log.push(name))));

it("runs one row's writes in the order they were made", async () => {
  const writes = inOrder();
  const log: Array<string> = [];
  // A slow Delete, then the Undo's quick Put of the same row.
  await Promise.all([
    Effect.runPromise(writes('e1', write(log, 'delete e1', 30))),
    Effect.runPromise(writes('e1', write(log, 'put e1', 0))),
  ]);
  expect(log).toEqual(['delete e1', 'put e1']);
});

it("runs different rows' writes side by side", async () => {
  const writes = inOrder();
  const log: Array<string> = [];
  await Promise.all([
    Effect.runPromise(writes('e1', write(log, 'delete e1', 30))),
    Effect.runPromise(writes('e2', write(log, 'put e2', 0))),
  ]);
  expect(log).toEqual(['put e2', 'delete e1']);
});

it('goes on after a write fails', async () => {
  const writes = inOrder();
  const log: Array<string> = [];
  const failed = Effect.runPromise(writes('e1', Effect.fail('refused'))).catch(
    () => log.push('failed'),
  );
  await Promise.all([
    failed,
    Effect.runPromise(writes('e1', write(log, 'put e1', 0))),
  ]);
  expect(log).toEqual(['failed', 'put e1']);
});
