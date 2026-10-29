import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema, ESchema } from '../../../../eschema/index.js';
import {
  StdTable,
  backfillReads,
  tableDeclaration,
} from '../../table/index.js';

const Project = EntityESchema.make('Project', 'projectId', {
  name: Schema.String,
}).build();

const Task = EntityESchema.make('Task', 'taskId', { title: Schema.String })
  .evolve('v2', { projectId: Schema.String })
  .build();

const Settings = ESchema.make('Settings', { theme: Schema.String })
  .evolve('v2', { density: Schema.String })
  .build();

const entities = () =>
  StdTable.make('board')
    .primary('pk', 'sk')
    .entity(Project, (e) => e.primary())
    .entity(Task, (e) => e.primary())
    .singleEntity(Settings, { default: { theme: 'light', density: 'cozy' } });

const fillTask = (task: { readonly title: string; readonly taskId: string }) =>
  Effect.succeed({ ...task, projectId: 'p1' });
const fillSettings = (settings: { readonly theme: string }) =>
  Effect.succeed({ ...settings, density: 'cozy' });

const filled = () =>
  entities()
    .backfill('task-project', { entity: 'Task', to: 'v2', run: fillTask })
    .backfill('settings-density', {
      entity: 'Settings',
      to: 'v2',
      run: fillSettings,
    });

// Each refusal below is also a type error; the casts reach the runtime check.
interface LooseBuilder {
  backfill(id: string, options: object): LooseBuilder;
  build(): unknown;
}
const loose = (builder: unknown) => builder as LooseBuilder;

describe('Backfill declarations', () => {
  it('records each Backfill on the table, in declaration order', () => {
    const board = filled()
      .backfill('task-by-project', {
        reindex: 'Task',
        after: ['task-project'],
      })
      .build();
    expect(board.registeredBackfills).toEqual([
      {
        id: 'task-project',
        kind: 'gap',
        entity: 'Task',
        to: 'v2',
        after: [],
      },
      {
        id: 'settings-density',
        kind: 'gap',
        entity: 'Settings',
        to: 'v2',
        after: [],
      },
      {
        id: 'task-by-project',
        kind: 'reindex',
        entity: 'Task',
        to: null,
        after: ['task-project'],
      },
    ]);
    expect(Object.isFrozen(board.registeredBackfills)).toBe(true);
  });

  it('keeps each run for the setup runner', () => {
    const board = filled().build();
    const { backfills, entities: declared } = tableDeclaration(board);
    expect(declared.map(({ schema }) => schema.name)).toEqual([
      'Project',
      'Task',
      'Settings',
    ]);
    expect(backfills.map(({ id, run }) => [id, run])).toEqual([
      ['task-project', fillTask],
      ['settings-density', fillSettings],
    ]);
  });

  it('gives run a view of every entity that only reads', () => {
    const board = filled().build();
    const reads = backfillReads(board) as Record<string, object>;
    expect(Object.keys(reads)).toEqual(['Project', 'Task', 'Settings']);
    expect(reads.Task).toEqual({
      get: board.Task.get,
      query: board.Task.query,
    });
    expect(reads.Settings).toEqual({ get: board.Settings.get });
  });

  it('refuses an accessor call on something that is not a built table', () => {
    expect(() => tableDeclaration({})).toThrow(/Not a table built by/);
  });

  it('takes no more entities once a Backfill is declared', () => {
    const builder = entities().backfill('task-project', {
      entity: 'Task',
      to: 'v2',
      run: fillTask,
    });
    expect('entity' in builder).toBe(false);
    expect('singleEntity' in builder).toBe(false);
  });

  it('refuses to build while a gap version has no Backfill', () => {
    expect(() => loose(entities()).build()).toThrow(
      'Every gap version needs a Backfill; none fills Task v2, Settings v2',
    );
    expect(() =>
      loose(
        entities().backfill('task-project', {
          entity: 'Task',
          to: 'v2',
          run: fillTask,
        }),
      ).build(),
    ).toThrow(/none fills Settings v2$/);
  });

  it.each([
    ['an empty id', '', { reindex: 'Task' }, 'Backfill id must not be empty'],
    [
      'a duplicate id',
      'task-project',
      { reindex: 'Task' },
      'Backfill "task-project" is already declared',
    ],
    [
      'a version already filled',
      'task-project-again',
      { entity: 'Task', to: 'v2', run: fillTask },
      'Backfill "task-project-again" fills Task v2, which Backfill "task-project" already fills',
    ],
    [
      'an unknown after',
      'later',
      { reindex: 'Task', after: ['nope'] },
      'Backfill "later" runs after "nope", which is not declared before it',
    ],
    [
      'an undeclared entity',
      'ghost',
      { reindex: 'Ghost' },
      'Backfill entity "Ghost" is not declared on this table',
    ],
    [
      'a version that is not a gap',
      'task-v1',
      { entity: 'Task', to: 'v1', run: fillTask },
      'Backfill "task-v1" fills Task v1, which is not a gap version of Task',
    ],
    [
      'a reindex of a single entity',
      'settings-reindex',
      { reindex: 'Settings' },
      'Backfill "settings-reindex" reindexes "Settings", a single entity, which has no indexes',
    ],
  ])('refuses %s', (_, id, options, message) => {
    const builder = loose(
      entities().backfill('task-project', {
        entity: 'Task',
        to: 'v2',
        run: fillTask,
      }),
    );
    expect(() => builder.backfill(id, options)).toThrow(message);
  });
});
