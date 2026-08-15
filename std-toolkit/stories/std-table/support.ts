import 'fake-indexeddb/auto';
import { Effect, Schema } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { Ulid } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { DynamoDB } from 'std-toolkit/db/dynamodb';
import { IDB } from 'std-toolkit/db/idb';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { EntityESchema, ESchema } from 'std-toolkit/eschema';

export const table = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const NoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  status: Schema.String,
}).build();

export const note = table
  .entity(NoteSchema)
  .primary({ pk: ['notebook'] })
  .index('LSI1', 'byTitle', { sk: ['title'] })
  .index('GSI1', 'byStatus', { pk: ['notebook'], sk: ['status', 'title'] })
  .build();

export const settings = table
  .singleEntity(
    ESchema.make('Settings', {
      theme: Schema.String,
      perPage: Schema.Number,
    }).build(),
  )
  .default({ theme: 'light', perPage: 20 });

export const dynamodbEndpoint =
  process.env.DYNAMODB_LOCAL_ENDPOINT ?? 'http://localhost:8090';

export const adapterNames = ['dynamodb', 'idb', 'sqlite'] as const;

let sessionNumber = 0;
const uniqueName = () => `std-table-stories-${process.pid}-${++sessionNumber}`;

const sequentialUlid = () => {
  let issued = 0;
  return () => String(++issued).padStart(26, '0');
};

const onDynamoDB = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const configured = DynamoDB.make(table, {
      tableName: uniqueName(),
      region: 'local',
      endpoint: dynamodbEndpoint,
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
    yield* configured.setup;
    return yield* program.pipe(
      Effect.provide(configured.layer),
      Effect.provideService(Ulid, sequentialUlid()),
      Effect.ensuring(Effect.orDie(configured.teardown)),
    );
  });

const onIDB = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const indexedDB = new IDBFactory();
    const databaseName = uniqueName();
    const database = IDB.database({ databaseName, indexedDB });
    const configured = IDB.make(table, { database });
    yield* configured.setup;
    return yield* program.pipe(
      Effect.provide(configured.layer),
      Effect.provideService(Ulid, sequentialUlid()),
      Effect.ensuring(
        Effect.promise(async () => {
          (await database.open()).close();
          await new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(databaseName);
            request.onsuccess = () => resolve(undefined);
            request.onerror = () => resolve(undefined);
            request.onblocked = () => resolve(undefined);
          });
        }),
      ),
    );
  });

const onSQLite = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    const configured = SQLite.make(table, { database });
    yield* configured.setup;
    return yield* program.pipe(
      Effect.provide(configured.layer),
      Effect.provideService(Ulid, sequentialUlid()),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    );
  });

export const parity = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.all({
    dynamodb: onDynamoDB(program),
    idb: onIDB(program),
    sqlite: onSQLite(program),
  });

export const agree = <A>(results: {
  readonly dynamodb: A;
  readonly idb: A;
  readonly sqlite: A;
}): boolean =>
  JSON.stringify(results.dynamodb) === JSON.stringify(results.idb) &&
  JSON.stringify(results.idb) === JSON.stringify(results.sqlite);

export const reasonOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'reason' in error
    ? String((error as { reason: { _tag: string } }).reason._tag)
    : String(error);
