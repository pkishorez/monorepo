import { Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';

// The table every chapter shares: a name and the two attributes that address a row.
export const table = StdTable.make('board').primary('pk', 'sk').build();

export const makingATableForTasksToLiveIn = Story.make({
  title: 'Making a table for tasks to live in',
  description:
    'A name and two key attributes make a complete table. No field of a task is named yet.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What is the least a table must declare?', {
      answer:
        'A name and two key attributes: a partition key (the attribute that says which group a row belongs to) and a sort key (the attribute that orders rows inside that group). Nothing else is required, and nothing about tasks appears yet.',
      proof: Effect.gen(function* () {
        yield* Story.assert(
          'the table knows its name',
          table.logicalName === 'board',
        );
        yield* Story.assert(
          'it has a partition key and a sort key',
          table.primary.pk === 'pk' && table.primary.sk === 'sk',
        );
        yield* Story.assert(
          'and nothing else',
          Object.keys(table.localSecondaryIndexes).length === 0 &&
            Object.keys(table.globalSecondaryIndexes).length === 0,
        );
        // The table as declared: its name and its two key attributes.
        return { name: table.logicalName, primary: table.primary };
      }),
    }),
    Story.question('Why `pk` and `sk`, and not `boardId` and `taskId`?', {
      answer:
        'Because the table does not know about tasks; it holds rows that two strings address. The next chapter decides which task fields produce those two strings.',
      proof: Effect.gen(function* () {
        yield* Story.assert(
          'the table names attributes, not task fields',
          typeof table.primary.pk === 'string' &&
            typeof table.primary.sk === 'string',
        );
        // The two key attributes, as strings the table will fill in later.
        return { primary: table.primary };
      }),
    }),
    Story.question(
      'Which database is this, and how would the program pick a different one?',
      {
        answer:
          'This one lives in memory: nothing to install, and it is gone when the process ends. A program never names its database; the layer wrapped around the program does, so a later chapter swaps that layer for SQLite, IndexedDB or DynamoDB and changes nothing else.',
        proof: Effect.gen(function* () {
          // A copy of the table that lives in this process only.
          const memory = Memory.make(table);
          // A program that reads every row the table holds, without naming a database.
          const program = Stream.runCollect(table.scan());
          // Wrapping the program in the memory layer is what decides where it runs.
          const rows = yield* program.pipe(Effect.provide(memory.layer));
          yield* Story.assert(
            'the fresh in-memory table holds nothing',
            rows.length === 0,
          );
          return { database: 'memory', rows: rows.length };
        }),
      },
    ),
  ],
});
