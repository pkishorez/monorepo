import { Context, Effect, Schema } from 'effect';
import { expectTypeOf } from 'vitest';
import { EntityESchema, ESchema } from '../../../../eschema/index.js';
import { StdTable } from '../../table/index.js';

const Project = EntityESchema.make('Project', 'projectId', {
  ownerId: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .build();

// v2 is a gap (the project a task belongs to), v3 migrates, v4 is a gap.
const Task = EntityESchema.make('Task', 'taskId', { title: Schema.String })
  .evolve('v2', { projectId: Schema.String })
  .evolve('v3', { done: Schema.Boolean }, (v2) => ({ ...v2, done: false }))
  .evolve('v4', { label: Schema.String })
  .build();

const Settings = ESchema.make('Settings', { theme: Schema.String })
  .evolve('v2', { density: Schema.String })
  .build();

const declared = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Project, (e) => e.primary())
  .entity(Task, (e) =>
    e.primary().index('GSI1', 'byProject', { pk: ['projectId'] }),
  )
  .singleEntity(Settings, {
    default: { theme: 'light', density: 'compact' },
  });

const board = declared
  .backfill('project-owner', {
    entity: 'Project',
    to: 'v2',
    run: (project) => Effect.succeed({ ...project, owner: project.ownerId }),
  })
  .backfill('task-project', {
    entity: 'Task',
    to: 'v2',
    after: ['project-owner'],
    run: (task, db) => {
      expectTypeOf(task).toEqualTypeOf<{
        readonly title: string;
        readonly taskId: string;
      }>();
      return db.Project.get({ projectId: 'p1' }).pipe(
        Effect.map((project) => ({
          ...task,
          projectId: project?.value.projectId ?? 'none',
        })),
      );
    },
  })
  .backfill('task-label', {
    entity: 'Task',
    to: 'v4',
    run: (task) => {
      expectTypeOf(task.done).toEqualTypeOf<boolean>();
      return Effect.succeed({ ...task, label: task.title });
    },
  })
  .backfill('settings-density', {
    entity: 'Settings',
    to: 'v2',
    run: (settings) => Effect.succeed({ ...settings, density: 'cozy' }),
  })
  .backfill('task-by-project', { reindex: 'Task', after: ['task-project'] })
  .build();
board.Task.get({ taskId: 't1' });

// @ts-expect-error a gap version with no Backfill fails the build
declared.build();

const filled = declared.backfill('project-owner', {
  entity: 'Project',
  to: 'v2',
  run: (project) => Effect.succeed({ ...project, owner: '' }),
});

// @ts-expect-error every gap version needs its Backfill, not just some
filled.build();

// `entity` offers the entities with an unfilled gap version, and `to` that
// entity's unfilled gap versions: what an editor completes.
type Choice = Parameters<typeof filled.backfill>[1];
expectTypeOf<Extract<Choice, { entity: string }>['entity']>().toEqualTypeOf<
  'Task' | 'Settings'
>();
expectTypeOf<Extract<Choice, { entity: 'Task' }>['to']>().toEqualTypeOf<
  'v2' | 'v4'
>();
expectTypeOf<Extract<Choice, { reindex: string }>['reindex']>().toEqualTypeOf<
  'Project' | 'Task'
>();
// @ts-expect-error v3 migrates; it is not a gap version
filled.backfill('task-v3', {
  entity: 'Task',
  to: 'v3',
  run: (task: unknown) => Effect.succeed(task),
});
// @ts-expect-error Project v2 is already filled
filled.backfill('project-again', {
  entity: 'Project',
  to: 'v2',
  run: (project: unknown) => Effect.succeed(project),
});

filled.backfill(
  // @ts-expect-error a Backfill id is declared once per table
  'project-owner',
  { reindex: 'Task' },
);

filled.backfill('reindex-task', {
  reindex: 'Task',
  // @ts-expect-error `after` names only Backfills declared before
  after: ['task-project'],
});

// @ts-expect-error a single entity has no indexes to reindex
filled.backfill('reindex-settings', { reindex: 'Settings' });

// @ts-expect-error no more entities once a Backfill is declared
void filled.entity;
// @ts-expect-error no more single entities once a Backfill is declared
void filled.singleEntity;

filled.backfill('task-project', {
  entity: 'Task',
  to: 'v2',
  run: (task, db) => {
    // The view reads, and nothing else.
    db.Task.query('byProject', { pk: { projectId: 'p1' }, '>': null });
    db.Settings.get();
    // @ts-expect-error a Backfill reads other entities, never writes them
    db.Project.insert({ projectId: 'p2', ownerId: 'o', owner: 'o' });
    // @ts-expect-error a single entity is read-only too
    db.Settings.put({ theme: 'dark', density: 'cozy' });
    return Effect.succeed({ ...task, projectId: 'p1' });
  },
});

// @ts-expect-error `run` returns the value at `to`
filled.backfill('task-project', {
  entity: 'Task',
  to: 'v2',
  run: (task) => Effect.succeed(task),
});

class Clock extends Context.Service<Clock, { readonly now: number }>()(
  'Clock',
) {}
// @ts-expect-error `run` may require only its own table
filled.backfill('task-project', {
  entity: 'Task',
  to: 'v2',
  run: (task) =>
    Effect.map(Clock, ({ now }) => ({ ...task, projectId: String(now) })),
});

export { board };
