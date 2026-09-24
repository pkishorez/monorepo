import { Effect, Match, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { EntityESchema } from 'std-toolkit/eschema';
import { Snapshot } from 'std-toolkit/snapshot';
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

// The other mistake: the step to v2 rewritten after it has already run, so the same old row now gets a different priority.
const TaskV2Rewritten = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
  assignee: Schema.NullOr(Schema.String),
  colour: Schema.String,
  notes: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'high' as const,
  }))
  .build();

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
const lastYearsRow = { _v: 'v1', ...lastYearsTask } as const;

// Four deploys of the same table, each a separate instance. The first holds only Task.
const firstDeploy = StdTable.make('board').primary('pk', 'sk').build();
firstDeploy
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

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

// Every deploy's `setup` on one SQLite database that lives in this process: the same physical table each time, as in production.
const deploy = (
  database: ReturnType<typeof makeNodeSQLite>,
  table: Parameters<typeof SQLite.make>[0],
) => SQLite.make(table, { database }).setup;

// What each deploy registered, by name.
const namesOn = (deploy: {
  readonly registeredEntities: readonly { readonly name: string }[];
}) => deploy.registeredEntities.map(({ name }) => name);

export const promisingNeverToBreakAnOldTask = Story.make({
  title: 'Promising never to break an old task',
  description:
    'A snapshot of the shape, written down as plain data, tells a safe change from one that would strand rows already saved, and the table can hold itself to it on every deploy.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What does a captured shape look like, and can something that has never seen `Task` read a task from it?',
      {
        answer:
          'Plain JSON: a snapshot (a written-down description of every version of a shape, both as stored and as the app sees it) with nothing in it that only the original code could run. `Snapshot.restore` rebuilds a working shape from that JSON alone, and it accepts and refuses tasks exactly like the original.',
        proof: Story.trace(
          Effect.gen(function* () {
            // Capture Task, and push it through JSON as a file or a wire would.
            const captured = Snapshot.capture(Task);
            const json = JSON.parse(JSON.stringify(captured));
            // Rebuild a working shape from the JSON alone, and take its first version as the app sees it.
            const restored = yield* Effect.fromNullishOr(
              Snapshot.restore(json.schemas)[0],
            );
            const v1 = yield* Effect.fromNullishOr(restored.versions[0]);
            const isTask = Schema.is(v1.decoded);
            // Render the snapshot as text for a human to read.
            const rendered = Snapshot.render(captured);
            yield* Story.assert(
              'the JSON round trip changes nothing',
              JSON.stringify(json) === JSON.stringify(captured),
            );
            yield* Story.assert(
              'the rebuilt shape accepts a task and refuses a wrong one',
              isTask(lastYearsTask) && !isTask({ taskId: 't1', title: 7 }),
            );
            return {
              root: json.root,
              versions: restored.versions.map(({ version }) => version),
              rendered,
            };
          }),
        ),
      },
    ),
    Story.question(
      'How does the diff describe a correct change, and how does it describe an edit to a version that already shipped?',
      {
        answer:
          "Adding v2 as a step is reported as `safe`; writing the field into v1 is `breaking`, and the proof of why is that a row saved last year no longer decodes through the edited shape. A snapshot records shapes, not the steps between them, so a rewritten step is invisible to the shape diff: the same row quietly decodes to two different values. That is what the golden rows in a table's test file exist for: `expectTableSnapshot` from `std-toolkit/snapshot/vitest` draws twenty values of each version, runs each step once, and commits the results beside the shapes, so a rewritten step changes a stored result and fails as `breaking` in CI.",
        proof: Story.trace(
          Effect.gen(function* () {
            // Compare last year's shape with the one that adds v2.
            const safe = Snapshot.diff(
              Snapshot.capture(Task),
              Snapshot.capture(TaskV2),
            );
            // Compare it with the one that edited v1 in place.
            const breaking = Snapshot.diff(
              Snapshot.capture(Task),
              Snapshot.capture(TaskEditedInPlace),
            );
            // Read last year's row through the edited shape; the failure comes back as a value.
            const stranded = yield* TaskEditedInPlace.decode(lastYearsRow).pipe(
              Effect.flip,
            );
            // A row saved after the edit reads fine, which is what hides the fault during development.
            const afterEdit = yield* TaskEditedInPlace.decode({
              ...lastYearsRow,
              priority: 'high',
            });
            // Compare the v2 step with its rewrite; the diff sees nothing, the row does.
            const unseen = Snapshot.diff(
              Snapshot.capture(TaskV2),
              Snapshot.capture(TaskV2Rewritten),
            );
            const before = yield* TaskV2.decode(lastYearsRow);
            const after = yield* TaskV2Rewritten.decode(lastYearsRow);
            yield* Story.assert(
              'a new step is safe',
              safe.length > 0 && safe.every(({ impact }) => impact === 'safe'),
            );
            yield* Story.assert(
              'an edited version is breaking, and does strand old rows',
              breaking.some(({ impact }) => impact === 'breaking') &&
                stranded._tag === 'ESchemaError' &&
                afterEdit.priority === 'high',
            );
            yield* Story.assert(
              'a rewritten step is invisible to the shape diff, yet changes what a row means',
              unseen.length === 0 && before.priority !== after.priority,
            );
            return {
              safe: Snapshot.renderChanges(safe),
              breaking: Snapshot.renderChanges(breaking),
              before: before.priority,
              after: after.priority,
            };
          }),
        ),
      },
    ),
    Story.question(
      'How does the table hold itself to the promise on its first deploy, on a safe change, and on a breaking one?',
      {
        answer:
          "Every adapter's `setup` runs the check; there is no separate call to forget and no flag around it. It creates the physical table if missing, reads the approved shape kept inside the table itself, and diffs the current one against it before touching any index. The first deploy writes the shape; a safe change moves it forward; a change that only needs stored rows repaired goes through with a warning and is remembered as owed; a breaking change is refused with `SnapshotIncompatible` while data, indexes, and the approved shape stay where they were. A table that already holds rows but no approved shape is refused too, since nothing can prove those rows match the code.",
        proof: Story.trace(
          Effect.gen(function* () {
            const database = makeNodeSQLite({ path: ':memory:' });
            // The first deploy: nothing to compare against, so the current shape becomes the approved one.
            yield* deploy(database, firstDeploy);
            // The same shape again simply matches.
            yield* deploy(database, firstDeploy);
            // Board joins the table: safe, and the approved shape moves forward to include it.
            yield* deploy(database, withBoard);
            // Going back to the narrower shape is now refused: the approved shape expects Board.
            const revert = yield* deploy(database, firstDeploy).pipe(
              Effect.flip,
            );
            // Task gains a way in by person: rows need repairing, which is a warning, not a refusal.
            yield* deploy(database, withIndex);
            // Task is re-keyed: refused, and the approved shape is untouched.
            const refused = yield* deploy(database, rekeyedTasks).pipe(
              Effect.flip,
            );
            yield* deploy(database, withIndex);
            const refusedChanges = Match.value(refused).pipe(
              Match.tag('SnapshotIncompatible', ({ changes }) => changes),
              Match.orElse(() => []),
            );
            yield* Story.assert(
              'the safe change moved the approved shape forward',
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
              refused: Snapshot.renderChanges(refusedChanges),
            };
          }),
        ),
      },
    ),
  ],
});
