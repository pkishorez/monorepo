import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { SQLite } from '@kstackz/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kstackz/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  assignee: Schema.NullOr(Schema.String),
}).build();

const table = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('GSI1', 'byAssignee', { pk: ['assignee'], sk: ['title'] })
  .build();

// One program, written once against the StdTable surface.
const program = Effect.gen(function* () {
  yield* task.insert({
    taskId: 't1',
    boardId: 'work',
    title: 'Review',
    assignee: 'ana',
  });
  yield* task.insert({
    taskId: 't2',
    boardId: 'work',
    title: 'Plan',
    assignee: 'ana',
  });
  yield* task.insert({
    taskId: 't3',
    boardId: 'home',
    title: 'Cook',
    assignee: null,
  });
  yield* task.getAndUpdate(
    { boardId: 'work', taskId: 't1' },
    { title: 'Review it' },
  );
  yield* task.delete({ boardId: 'home', taskId: 't3' });
  const work = yield* task.query('primary', {
    pk: { boardId: 'work' },
    '>=': null,
  });
  const ana = yield* task.query('byAssignee', {
    pk: { assignee: 'ana' },
    '>=': null,
  });
  const home = yield* task.get({ boardId: 'home', taskId: 't3' });
  return {
    work: work.items.map(({ value }) => value.title),
    ana: ana.items.map(({ value }) => value.title),
    homeDeleted: home?.meta._d ?? null,
  };
});

export default Proof.make({
  title: 'The same program gives the same answers on Memory and on SQLite',
  description:
    'Swapping the adapter layer changes nothing else. SQLite runs on the shipped node:sqlite driver, in memory.',
  prepare: Effect.gen(function* () {
    const memory = Memory.make(table);
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(table, { database });
    const sqlite = SQLite.make(table, { database });
    yield* Proof.assert(
      'the SQLite table is ready',
      sqlite.tableName === 'board',
    );
    return { memory, sqlite };
  }),
  act: ({ memory, sqlite }) =>
    Effect.all({
      memory: program.pipe(Effect.provide(memory.layer)),
      sqlite: program.pipe(Effect.provide(sqlite.layer)),
    }),
  verify: ({ memory, sqlite }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'Memory gives the expected answers',
        memory.work.join() === 'Review it,Plan' &&
          memory.ana.join() === 'Plan,Review it' &&
          memory.homeDeleted === true,
      );
      yield* Proof.assert(
        'SQLite gives the same answers',
        JSON.stringify(sqlite) === JSON.stringify(memory),
      );
    }),
});
