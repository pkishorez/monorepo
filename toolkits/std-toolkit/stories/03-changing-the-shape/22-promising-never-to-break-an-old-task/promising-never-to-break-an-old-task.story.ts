import { Effect, Match, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema, toSchema } from 'std-toolkit/eschema';
import { SnapshotIncompatible, TableSnapshot } from 'std-toolkit/snapshot';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';
import { Board } from '../../02-more-ways-in/11-keeping-boards-and-tasks-in-the-same-table/keeping-boards-and-tasks-in-the-same-table.story.js';
import { TaskV2 } from '../17-adding-a-field-to-tasks-that-already-exist/adding-a-field-to-tasks-that-already-exist.story.js';

// The mistake this chapter guards against: priority written into the first version instead of added as a step. Rows already saved at v1 have no priority, and this shape still calls itself v1.
const TaskEditedInPlace = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
  assignee: Schema.NullOr(Schema.String),
  colour: Schema.String,
  notes: Schema.String,
  priority: Schema.Literals(['low', 'high']),
}).build();

// A task exactly as last year's code held it, and the row it saved.
const lastYearsTask = {
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: null,
  colour: 'blue',
  notes: 'Ask Ana first',
} as const;

// A table holding one shape, so each shape can be captured on its own.
const tableOf = (
  task: typeof Task | typeof TaskV2 | typeof TaskEditedInPlace,
) => {
  const table = StdTable.make('board').primary('pk', 'sk').build();
  table
    .entity(task)
    .primary({ pk: ['boardId'] })
    .build();
  return table;
};

// Four deploys of the same table, each a separate instance. The first holds only Task.
const firstDeploy = tableOf(Task);

// The second adds Board beside it: a safe change, nothing already stored is affected.
const withBoard = StdTable.make('board').primary('pk', 'sk').build();
withBoard
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
withBoard
  .entity(Board)
  .primary({ pk: ['boardId'] })
  .build();

// The third gives Task a way in by person: rows already stored cannot answer it until they are repaired, which is the next chapter.
const withIndex = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
withIndex
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('GSI1', 'byAssignee', { pk: ['assignee'], sk: ['status', 'title'] })
  .build();
withIndex
  .entity(Board)
  .primary({ pk: ['boardId'] })
  .build();

// The fourth moves Task to a different partition key: every stored row sits under a key this table would never look up.
const rekeyedTasks = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
rekeyedTasks
  .entity(Task)
  .primary({ pk: ['title'] })
  .index('GSI1', 'byAssignee', { pk: ['assignee'], sk: ['status', 'title'] })
  .build();
rekeyedTasks
  .entity(Board)
  .primary({ pk: ['boardId'] })
  .build();

// A change that would strand a stored row, or that the snapshot cannot check.
const rejected = (changes: ReturnType<typeof TableSnapshot.diff>) =>
  changes.filter(
    ({ impact }) => impact === 'breaking' || impact === 'unverifiable',
  );

// What the snapshot guard in `std-toolkit/alchemy` does on every deploy, with a variable standing in for Alchemy state: remember the last accepted snapshot, refuse a new one that is not upgradable from it.
const makeGuard = () => {
  let accepted: TableSnapshot | undefined;
  return (table: Parameters<typeof TableSnapshot.capture>[0]) =>
    Effect.gen(function* () {
      const current = TableSnapshot.capture(table);
      if (accepted !== undefined) {
        const changes = TableSnapshot.diff(accepted, current);
        if (rejected(changes).length > 0) {
          return yield* Effect.fail(
            new SnapshotIncompatible(rejected(changes)),
          );
        }
      }
      accepted = current;
    });
};

// What each deploy registered, by name.
const namesOn = (deploy: {
  readonly registeredEntities: readonly { readonly name: string }[];
}) => deploy.registeredEntities.map(({ name }) => name);

export const promisingNeverToBreakAnOldTask = Story.make({
  title: 'Promising never to break an old task',
  description:
    'A snapshot of the shape, written down as plain data, tells a safe change from one that would strand rows already saved, and the deploy holds itself to it.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What does a captured shape look like, and does it survive being written down?',
      {
        answer:
          'Plain JSON: a table snapshot (a written-down description of the table and every version of every shape in it, both as stored and as the app sees it) with nothing in it that only the original code could run. It can be saved to a file or sent over the wire, and `TableSnapshot.parse` reads it back as the same snapshot, so a later deploy can compare against it without the code that produced it.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Capture the first deploy, and push it through JSON as a file or a wire would.
            const captured = TableSnapshot.capture(firstDeploy);
            const json = JSON.parse(JSON.stringify(captured));
            // Read the JSON back, checking every reference in it.
            const parsed = yield* TableSnapshot.parse(json);
            const task = yield* Effect.fromNullishOr(
              parsed.schemas.find(({ identity }) => identity === 'Task'),
            );
            yield* Story.assert(
              'the JSON reads back as the same snapshot',
              TableSnapshot.diff(captured, parsed).length === 0,
            );
            return {
              table: parsed.logicalName,
              entities: parsed.entities.map(({ name }) => name),
              taskVersions: task.versions.map(({ version }) => version),
            };
          }),
        ),
      },
    ),
    Story.question(
      'How does the diff describe a correct change, and how does it describe an edit to a version that already shipped?',
      {
        answer:
          'Adding v2 as a step is reported as `safe`; writing the field into v1 is `breaking`, and the proof of why is that a row saved last year no longer decodes through the edited shape. A snapshot records shapes, not the functions between them: a migration is code, and a rewritten one is a code review matter like any other function.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Compare last year's shape with the one that adds v2.
            const safe = TableSnapshot.diff(
              TableSnapshot.capture(tableOf(Task)),
              TableSnapshot.capture(tableOf(TaskV2)),
            );
            // Compare it with the one that edited v1 in place.
            const breaking = TableSnapshot.diff(
              TableSnapshot.capture(tableOf(Task)),
              TableSnapshot.capture(tableOf(TaskEditedInPlace)),
            );
            // Read last year's row through the edited shape; the failure comes back as a value.
            const stranded = yield* Schema.decodeUnknownEffect(
              toSchema(TaskEditedInPlace),
            )({
              _v: 'v1',
              ...lastYearsTask,
            }).pipe(Effect.flip);
            // A row saved after the edit reads fine, which is what hides the fault during development.
            const afterEdit = yield* Schema.decodeUnknownEffect(
              toSchema(TaskEditedInPlace),
            )({
              _v: 'v1',
              ...lastYearsTask,
              priority: 'high',
            });
            yield* Story.assert(
              'a new step is safe',
              safe.length > 0 && rejected(safe).length === 0,
            );
            yield* Story.assert(
              'an edited version is breaking, and does strand old rows',
              rejected(breaking).length > 0 &&
                stranded._tag === 'SchemaError' &&
                afterEdit.priority === 'high',
            );
            return {
              safe: TableSnapshot.renderChanges(safe),
              breaking: TableSnapshot.renderChanges(breaking),
            };
          }),
        ),
      },
    ),
    Story.question(
      'How does a deploy hold itself to the promise on its first run, on a safe change, and on a breaking one?',
      {
        answer:
          'Through the snapshot guard in `std-toolkit/alchemy`: `D1.table` and `DynamoDB.table` each keep the last accepted snapshot in Alchemy state and diff the current one against it before the table is prepared. The first deploy records the shape; a safe change moves it forward; a change that only needs stored rows repaired goes through with a warning; a breaking change fails the deploy with `SnapshotIncompatible` and nothing is touched. Nothing runs at request time, and no layer ever reads the snapshot. Here a variable stands in for Alchemy state, and the decisions are the same ones.',
        proof: Story.trace(
          Effect.gen(function* () {
            const deploy = makeGuard();
            // The first deploy: nothing to compare against, so the current shape becomes the accepted one.
            yield* deploy(firstDeploy);
            // The same shape again simply matches.
            yield* deploy(firstDeploy);
            // Board joins the table: safe, and the accepted shape moves forward to include it.
            yield* deploy(withBoard);
            // Going back to the narrower shape is now refused: the accepted shape expects Board.
            const revert = yield* deploy(firstDeploy).pipe(Effect.flip);
            // Task gains a way in by person: rows need repairing, which is a warning, not a refusal.
            yield* deploy(withIndex);
            // Task is re-keyed: refused, and the accepted shape is untouched.
            const refused = yield* deploy(rekeyedTasks).pipe(Effect.flip);
            yield* deploy(withIndex);
            const refusedChanges = Match.value(refused).pipe(
              Match.tag('SnapshotIncompatible', ({ changes }) => changes),
              Match.orElse(() => []),
            );
            yield* Story.assert(
              'the safe change moved the accepted shape forward',
              revert._tag === 'SnapshotIncompatible',
            );
            yield* Story.assert(
              'the breaking change was refused',
              refusedChanges.length > 0 &&
                refusedChanges.every(({ impact }) => impact === 'breaking'),
            );
            return {
              deploys: {
                first: namesOn(firstDeploy),
                withBoard: namesOn(withBoard),
                withIndex: namesOn(withIndex),
                rekeyedTasks: namesOn(rekeyedTasks),
              },
              revert: revert._tag,
              refused: TableSnapshot.renderChanges(refusedChanges),
            };
          }),
        ),
      },
    ),
  ],
});
