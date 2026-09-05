import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';
import { fresh } from '../../env.js';
import {
  table,
  task,
} from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// Task with a second version. The first version's fields are written out again only because a new version is being declared: a shape is its whole history, and `evolve` adds `priority` as the next step, with the rule that turns any older task into one that has it.
export const TaskV2 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
  assignee: Schema.NullOr(Schema.String),
  colour: Schema.String,
  notes: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// The same table, built again: one table instance holds one shape per name, so today's Task needs its own instance of the table it shares with last year's rows.
export const tableToday = StdTable.make('board')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

// Today's Task attached to it, placed exactly as chapter 10 placed the old one, so both address the same rows.
export const taskV2 = tableToday
  .entity(TaskV2)
  .primary({ pk: ['boardId'] })
  .index('LSI1', 'byTitle', { sk: ['title'] })
  .index('GSI1', 'byAssignee', { pk: ['assignee'], sk: ['status', 'title'] })
  .build();

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

// A task exactly as last year's code saved it, and the key that finds it.
const key = { taskId: 't1', boardId: 'work' };
const lastYear = {
  ...key,
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: 'Ask Ana first',
} as const;

export const addingAFieldToTasksThatAlreadyExist = Story.make({
  title: 'Adding a field to tasks that already exist',
  description:
    'Tasks gain a priority. The tasks saved before there was such a thing keep working, and move to the new shape only as they are read.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A task was written last year, before priority existed. What does the app see when it reads it today?',
      {
        answer:
          'A task with `priority: "low"`. The stored row is stamped `_v: "v1"`, so decoding runs the step from v1 to v2 (a migration: a plain function that turns the older shape into the next one) before the task reaches your code, and nothing about the row itself changes.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Decode a row exactly as last year's code wrote it; the new field is filled in on the way out.
            const seen = yield* TaskV2.decode({ _v: 'v1', ...lastYear });
            // Encode what the app now holds; it is written as the newest version, priority included.
            const written = yield* TaskV2.encode(seen);
            yield* Story.assert(
              'the old task gained the new field, and lost nothing',
              seen.priority === 'low' && seen.notes === 'Ask Ana first',
            );
            yield* Story.assert(
              'the app never sees the version; storage gets the newest one',
              !('_v' in seen) && written._v === 'v2',
            );
            return { seen, written };
          }),
        ),
      },
    ),
    Story.question(
      'Does an old row run every step, or only the ones above it?',
      {
        answer:
          'Only the steps above the version stamped on it. A row already at the newest version runs none, which is why a task saved with `priority: "high"` keeps it instead of being reset to `"low"`.',
        proof: Story.trace(
          Effect.gen(function* () {
            // A row from last year: the v1 to v2 step runs.
            const fromV1 = yield* TaskV2.decode({ _v: 'v1', ...lastYear });
            // A row already at v2: no step runs, so its own priority survives.
            const fromV2 = yield* TaskV2.decode({
              _v: 'v2',
              ...lastYear,
              priority: 'high',
            });
            yield* Story.assert(
              'the v1 row went through the step',
              fromV1.priority === 'low',
            );
            yield* Story.assert(
              'the v2 row was left alone',
              fromV2.priority === 'high',
            );
            return { fromV1, fromV2 };
          }),
        ),
      },
    ),
    Story.question('Is it still the same task after it is written back?', {
      answer:
        "Yes: its `taskId` is the one field no step may touch, so an update through today's code rewrites the row at v2 under the same key, with the same stamp shape you know from chapter 4. Code still on last year's shape can no longer read that row, though, so ship the new shape everywhere before anything writes with it.",
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Last year's code saves the task; the row is stamped v1.
            yield* task.insert(lastYear);
            // Today's code reads it back and sees a priority.
            const seen = yield* taskV2.get(key);
            // Today's code changes the priority; the whole row is rewritten at v2.
            const updated = yield* taskV2.getAndUpdate(key, {
              priority: 'high',
            });
            // Last year's code tries to read the rewritten row; the failure comes back as a value.
            const oldReader = yield* task.get(key).pipe(Effect.flip);
            yield* Story.assert(
              'the read filled in the new field without touching the row',
              seen?.value.priority === 'low' && !('_v' in seen.meta),
            );
            yield* Story.assert(
              'the update kept the identity and moved only the update stamp',
              updated.value.taskId === 't1' &&
                updated.value.priority === 'high' &&
                updated.meta._u > (seen?.meta._u ?? ''),
            );
            yield* Story.assert(
              "last year's code cannot read a v2 row",
              oldReader.reason._tag === 'DecodeFailed',
            );
            return { seen, updated, oldReader: oldReader.reason._tag };
          }),
        ),
      ),
    }),
  ],
});
