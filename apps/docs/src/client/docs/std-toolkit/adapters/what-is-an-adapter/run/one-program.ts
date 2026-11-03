import { Console, Effect, Stream } from 'effect';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { saveAndList, table } from '../components/board.ts';

export const program = Effect.suspend(() => {
  // The adapter: Memory gives the 'board' table a home, as a layer.
  const memory = Memory.make(table);

  return Effect.gen(function* () {
    // The program runs on whatever home it is given.
    const tasks = yield* saveAndList;
    yield* Console.log('what the program read', tasks);

    // Underneath, the rows as the adapter keeps them: keys, data, meta.
    const rows = yield* Stream.runCollect(table.scan());
    yield* Console.log('what the adapter stored', [...rows]);
  }).pipe(Effect.provide(memory.layer));
});
