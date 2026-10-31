import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
// Another tool's idea of a Task v1: the title is a number.
const ForeignTask = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.Finite,
}).build();

const anotherTool = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(ForeignTask, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();

export default Proof.make({
  title:
    'A row that does not match its version fails to read instead of being guessed at',
  description:
    'The bad row fails with DecodeFailed where it is read. Its neighbours still read by key; a list that passes through it fails.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    yield* anotherTool.Task.insert({
      taskId: 't1',
      boardId: 'work',
      title: 7,
    }).pipe(Effect.provide(db.layer));
    const neighbour = yield* table.Task.insert({
      taskId: 't2',
      boardId: 'work',
      title: 'Review',
    }).pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'a bad row and a good row share the board',
      neighbour.value.title === 'Review',
    );
    return { db };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const outcome = <A, R>(
        read: Effect.Effect<
          A,
          { readonly reason: { readonly _tag: string } },
          R
        >,
      ) =>
        read.pipe(
          Effect.match({
            onFailure: (error) => error.reason._tag,
            onSuccess: () => 'read',
          }),
        );
      const badRow = yield* outcome(
        table.Task.get({ boardId: 'work', taskId: 't1' }),
      );
      const neighbour = yield* outcome(
        table.Task.get({ boardId: 'work', taskId: 't2' }),
      );
      const listing = yield* outcome(
        table.Task.query('primary', { pk: { boardId: 'work' }, '>=': null }),
      );
      return { badRow, neighbour, listing };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ badRow, neighbour, listing }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the bad row fails as DecodeFailed',
        badRow === 'DecodeFailed',
      );
      yield* Proof.assert('the neighbour reads by key', neighbour === 'read');
      yield* Proof.assert(
        'a list through the bad row fails rather than skipping it',
        listing === 'DecodeFailed',
      );
    }),
});
