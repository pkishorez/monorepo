import Database from 'better-sqlite3';
import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import { SQLiteTable, SQLiteEntity } from '@std-toolkit/sqlite';
import { SqliteDBBetterSqlite3 } from '@std-toolkit/sqlite/adapters/better-sqlite3';
import { vdescribe, vtest } from '@monorepo/vtest';

const NoteSchema = EntityESchema.make('Note', 'noteId', {
  text: Schema.String,
}).build();

vdescribe(
  'one table, provided by an adapter layer',
  'setup() creates the physical table; the layer chooses the engine',
  () => {
    vtest(
      'setup() then a write succeeds against an in-memory database',
      'the table is a description; the adapter layer makes it real',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const table = SQLiteTable.make({ tableName: 'std_data' })
              .primary('pk', 'sk')
              .build();
            const notes = SQLiteEntity.make(table)
              .eschema(NoteSchema)
              .primary()
              .build();

            const layer = SqliteDBBetterSqlite3(new Database(':memory:'));

            yield* Effect.gen(function* () {
              yield* table.setup();
              const written = yield* notes.insert({
                noteId: 'n1',
                text: 'hello',
              });
              if (written.value.text !== 'hello') {
                throw new Error('expected the stored note back');
              }
            }).pipe(Effect.provide(layer));
          }),
        ),
    );

    vtest(
      'two tables built from one description stay independent per layer',
      'a SQLiteTable is reusable config; state lives in the provided DB',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const table = SQLiteTable.make({ tableName: 'std_data' })
              .primary('pk', 'sk')
              .build();
            const notes = SQLiteEntity.make(table)
              .eschema(NoteSchema)
              .primary()
              .build();

            const run = <A>(e: Effect.Effect<A, unknown, never>) =>
              e.pipe(
                Effect.provide(SqliteDBBetterSqlite3(new Database(':memory:'))),
              );

            yield* run(
              table
                .setup()
                .pipe(
                  Effect.flatMap(() =>
                    notes.insert({ noteId: 'a', text: 'x' }),
                  ),
                ),
            );
            // A fresh in-memory DB has none of the first DB's rows.
            const found = yield* run(
              table
                .setup()
                .pipe(Effect.flatMap(() => notes.get({ noteId: 'a' }))),
            );
            if (found !== null) throw new Error('expected an empty second db');
          }),
        ),
    );
  },
);
