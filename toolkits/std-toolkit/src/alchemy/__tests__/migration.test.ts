import { Effect, Schema } from 'effect';
import { afterAll, expect, it, vi } from 'vitest';
import { EntityESchema } from '../../eschema/index.js';
import { MigrationRowFailed, StdTable } from '../../db/index.js';
import { DynamoDB as DynamoDBAdapter } from '../../db/dynamodb/index.js';
import { makeNodeSQLite } from '../../db/sqlite/drivers/node/index.js';
import { SQLite } from '../../db/sqlite/index.js';

vi.mock('alchemy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('alchemy')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    Resource: () => (id: string, props: unknown) =>
      Effect.succeed({ LogicalId: id, Props: props }),
  };
});
import { D1, runD1Migration } from '../d1/d1.js';
import { DynamoDB, runDynamoDBMigration } from '../dynamodb/dynamodb.js';

const NoteV1 = EntityESchema.make('Note', 'noteId', {
  text: Schema.String,
}).build();
const Note = EntityESchema.make('Note', 'noteId', {
  text: Schema.String,
  words: Schema.Int,
}).build();
const oldNotes = StdTable.make('notes-v1')
  .primary('pk', 'sk')
  .entity(NoteV1, (e) => e.primary())
  .build();
const notes = StdTable.make('notes')
  .primary('pk', 'sk')
  .entity(Note, (e) => e.primary())
  .build();

const migrate = (fail = false) =>
  StdTable.migrate(oldNotes, notes, {
    Note: (note, { next }) =>
      fail
        ? Effect.fail('no words' as const)
        : next.Note.insert({
            ...note.value,
            words: note.value.text.split(' ').length,
          }),
  });

type Declared<P> = { LogicalId: string; Props: P };

/** A declared table resource as the migration reads it: its attributes and its props. */
const tableResource = (attributes: object, props: object) =>
  ({ ...attributes, Props: props }) as never;

it('declares a D1 migration that keeps both addresses in state and carries the run', async () => {
  const migration = migrate();
  const resource = (await Effect.runPromise(
    D1.migration('NotesMigration', {
      from: tableResource(
        { databaseId: 'db-1', tableName: 'notes-v1' },
        { table: () => oldNotes },
      ),
      to: tableResource(
        { databaseId: 'db-1', tableName: 'notes' },
        { table: () => notes },
      ),
      migrate: migration,
    }) as Effect.Effect<unknown>,
  )) as Declared<Parameters<typeof runD1Migration>[0]>;

  expect(resource.LogicalId).toBe('NotesMigration');
  expect(JSON.parse(JSON.stringify(resource.Props))).toEqual({
    from: { databaseId: 'db-1', tableName: 'notes-v1' },
    to: { databaseId: 'db-1', tableName: 'notes' },
    tableName: 'notes',
  });
  const run = resource.Props.run();
  expect(run.from).toBe(oldNotes);
  expect(run.to).toBe(notes);
  expect(run.migrate).toBe(migration);
});

const d1Props = (fail = false) => ({
  from: { databaseId: 'db-1', tableName: 'notes_v1' },
  to: { databaseId: 'db-1', tableName: 'notes_v2' },
  tableName: 'notes_v2',
  run: () => ({ from: oldNotes, to: notes, migrate: migrate(fail) }),
});

it('runs the migration in D1 at deploy, and is a no-op once done', async () => {
  const database = makeNodeSQLite({ path: ':memory:' });
  const open = () => Effect.succeed(database);
  try {
    const oldLayer = SQLite.make(oldNotes, {
      database,
      tableName: 'notes_v1',
    }).layer;
    const newLayer = SQLite.make(notes, {
      database,
      tableName: 'notes_v2',
    }).layer;
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* SQLite.setup(oldNotes, {
          database,
          tableName: 'notes_v1',
          mode: 'persistent',
        });
        yield* SQLite.setup(notes, {
          database,
          tableName: 'notes_v2',
          mode: 'persistent',
        });
        yield* oldNotes.Note.insert({ noteId: 'n1', text: 'two words' });
      }).pipe(Effect.provide(oldLayer)),
    );

    const failed = await Effect.runPromise(
      Effect.flip(runD1Migration(d1Props(true), open)),
    );
    expect(failed).toBeInstanceOf(MigrationRowFailed);

    const attributes = await Effect.runPromise(runD1Migration(d1Props(), open));
    expect(attributes).toEqual({
      from: { databaseId: 'db-1', tableName: 'notes_v1' },
      to: { databaseId: 'db-1', tableName: 'notes_v2' },
      tableName: 'notes_v2',
    });
    const migrated = await Effect.runPromise(
      notes.Note.get({ noteId: 'n1' }).pipe(Effect.provide(newLayer)),
    );
    expect(migrated?.value).toEqual({
      noteId: 'n1',
      text: 'two words',
      words: 2,
    });
    // A later deploy finds the migration done.
    await Effect.runPromise(runD1Migration(d1Props(true), open));
  } finally {
    database.close?.();
  }
});

it('declares a DynamoDB migration with each table resource credentials', async () => {
  const credentials = { accessKeyId: 'key', secretAccessKey: 'secret' };
  const resource = (await Effect.runPromise(
    DynamoDB.migration('NotesMigration', {
      from: tableResource(
        { tableName: 'notes-v1', region: 'eu-west-1' },
        { table: () => oldNotes, credentials: () => credentials },
      ),
      to: tableResource(
        { tableName: 'notes', region: 'eu-west-1' },
        { table: () => notes, credentials: () => credentials },
      ),
      migrate: migrate(),
    }) as Effect.Effect<unknown>,
  )) as Declared<Parameters<typeof runDynamoDBMigration>[0]>;

  expect(JSON.parse(JSON.stringify(resource.Props))).toEqual({
    from: { tableName: 'notes-v1', region: 'eu-west-1' },
    to: { tableName: 'notes', region: 'eu-west-1' },
    tableName: 'notes',
  });
  const run = resource.Props.run();
  expect(run.from).toEqual({ table: oldNotes, credentials });
  expect(run.to).toEqual({ table: notes, credentials });
});

const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
const tableNames: string[] = [];
const local = (tableName: string) => ({
  tableName,
  region: 'local',
  endpoint: endpoint!,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
afterAll(() =>
  Effect.runPromise(
    Effect.forEach(tableNames, (name) =>
      DynamoDBAdapter.deleteTable(local(name)).pipe(Effect.ignore),
    ),
  ),
);

(endpoint === undefined ? it.skip : it)(
  'runs the migration in DynamoDB Local at deploy',
  async () => {
    const from = `notes-v1-${process.pid}-${Date.now()}`;
    const to = `notes-${process.pid}-${Date.now()}`;
    tableNames.push(from, to);
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* DynamoDBAdapter.setup(oldNotes, local(from), {
          mode: 'persistent',
        });
        yield* DynamoDBAdapter.setup(notes, local(to), { mode: 'persistent' });
        yield* oldNotes.Note.insert({ noteId: 'n1', text: 'one' }).pipe(
          Effect.provide(DynamoDBAdapter.make(oldNotes, local(from)).layer),
        );
      }),
    );
    const side = { credentials: local(from).credentials };
    const props = {
      from: { tableName: from, region: 'local', endpoint: endpoint! },
      to: { tableName: to, region: 'local', endpoint: endpoint! },
      tableName: to,
      run: () => ({
        from: { ...side, table: oldNotes },
        to: { ...side, table: notes },
        migrate: migrate(),
      }),
    };

    await Effect.runPromise(runDynamoDBMigration(props));

    const migrated = await Effect.runPromise(
      notes.Note.get({ noteId: 'n1' }).pipe(
        Effect.provide(DynamoDBAdapter.make(notes, local(to)).layer),
      ),
    );
    expect(migrated?.value.words).toBe(1);
  },
  60_000,
);
