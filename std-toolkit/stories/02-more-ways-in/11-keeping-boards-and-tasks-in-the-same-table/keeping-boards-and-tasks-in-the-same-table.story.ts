import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';
import { fresh } from '../../env.js';
import {
  table,
  task,
} from '../10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// What a board is: an id and a name. `boardId` tells one board from another.
export const Board = EntityESchema.make('Board', 'boardId', {
  name: Schema.String,
}).build();

// Board attached to the same table. Its `boardId` fills the partition key and, as its id, the sort key too.
export const board = table
  .entity(Board)
  .primary({ pk: ['boardId'] })
  .build();

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// A board called `work`, and a task on it whose id is also `work`.
const workBoard = { boardId: 'work', name: 'Work' };
const workTask = {
  taskId: 'work',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: '',
} as const;

export const keepingBoardsAndTasksInTheSameTable = Story.make({
  title: 'Keeping boards and tasks in the same table',
  description:
    "A second kind of thing, Board, attached to the table Task already lives in. The two never see each other's rows.",
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A board and a task both use the key value `work`. Do they collide?',
      {
        answer:
          'No. Every stored key starts with the name of its entity, so `Board` rows and `Task` rows with the same values sit in different groups. Each entity reads only its own rows, and saving one never overwrites the other.',
        proof: onBoard(
          Story.trace(
            Effect.gen(function* () {
              // Save the board, then a task with the same key values.
              const savedBoard = yield* board.insert(workBoard);
              const savedTask = yield* task.insert(workTask);
              // Read each back by the same key.
              const readBoard = yield* board.get({ boardId: 'work' });
              const readTask = yield* task.get({
                taskId: 'work',
                boardId: 'work',
              });
              // List the `work` group through each entity.
              const boards = yield* board.query('primary', {
                pk: { boardId: 'work' },
                '>=': null,
              });
              const tasks = yield* task.query('primary', {
                pk: { boardId: 'work' },
                '>=': null,
              });
              yield* Story.assert(
                'each row is stamped with its own entity name',
                savedBoard.meta._e === 'Board' && savedTask.meta._e === 'Task',
              );
              yield* Story.assert(
                'neither save overwrote the other',
                readBoard?.value.name === 'Work' &&
                  readTask?.value.title === 'Write the plan',
              );
              yield* Story.assert(
                'each entity lists only its own rows',
                boards.items.map(({ meta }) => meta._e).join() === 'Board' &&
                  tasks.items.map(({ meta }) => meta._e).join() === 'Task',
              );
              return { savedBoard, savedTask, readBoard, readTask };
            }),
          ),
        ),
      },
    ),
    Story.question('What does the table know about who lives in it?', {
      answer:
        'Every entity attached to it, by name, with the key fields each one declared. Attaching a second entity under a name that is already taken is refused at build time, so two kinds of thing can never share a name.',
      proof: Effect.gen(function* () {
        // The entities the table has been told about, by name.
        const residents = table.registeredEntities.map(({ name }) => name);
        // Try to attach a second entity called `Board`; the table refuses.
        const refused = yield* Effect.try(() =>
          table
            .entity(Board)
            .primary({ pk: ['boardId'] })
            .build(),
        ).pipe(Effect.flip);
        yield* Story.assert(
          'both Task and Board are registered',
          residents.includes('Task') && residents.includes('Board'),
        );
        yield* Story.assert(
          'a second Board is refused',
          String(refused.cause).includes('already defined'),
        );
        return {
          residents,
          boardKey: board.primary,
          refused: String(refused.cause),
        };
      }),
    }),
  ],
});
