import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../std-table/table/index.js';
import { expectTableShippable } from '../index.js';

// Each Backfill can pass alone and the schedule still fail: a database at
// the oldest versions owes them all at once, and setup runs each entity's
// pending Backfills in one scan.

const never = './fixtures/never-written.snapshot.json';

const Task = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .build();
const Project = EntityESchema.make('Project', 'projectId', {
  name: Schema.String,
})
  .evolve('v2', { lead: Schema.String })
  .build();

describe('expectTableShippable over the schedule of every Backfill', () => {
  it('refuses at build a schedule setup could not order, naming the Backfills', () => {
    const Area = EntityESchema.make('Area', 'areaId', { name: Schema.String })
      .evolve('v2', { code: Schema.String })
      .evolve('v3', { label: Schema.String })
      .build();
    const Zone = EntityESchema.make('Zone', 'zoneId', { name: Schema.String })
      .evolve('v2', { code: Schema.String })
      .build();
    const declare = () =>
      StdTable.make('regions')
        .primary('pk', 'sk')
        .entity(Area, (e) => e.primary())
        .entity(Zone, (e) => e.primary())
        .backfill('area-code', {
          entity: 'Area',
          to: 'v2',
          run: (area) => Effect.succeed({ ...area, code: 'a' }),
        })
        .backfill('zone-code', {
          entity: 'Zone',
          to: 'v2',
          after: ['area-code'],
          run: (zone) => Effect.succeed({ ...zone, code: 'z' }),
        })
        .backfill('area-label', {
          entity: 'Area',
          to: 'v3',
          after: ['zone-code'],
          run: (area) => Effect.succeed({ ...area, label: 'l' }),
        })
        .build();
    expect(declare).toThrow(
      /Table "regions" cannot run its Backfills: [^\n]*cycle[^\n]*"area-code"[^\n]*"zone-code"[^\n]*"area-label"/,
    );
  });

  it('fails a Backfill that reads an entity whose own Backfill has not run yet', async () => {
    const table = StdTable.make('board')
      .primary('pk', 'sk')
      .entity(Task, (e) => e.primary({ pk: ['projectId'] }))
      .entity(Project, (e) => e.primary())
      // Reads every Project, but is not declared after the Project Backfill:
      // on a database at v1 it scans first and meets v1 Projects.
      .backfill('task-owner', {
        entity: 'Task',
        to: 'v2',
        run: (task, db) =>
          Effect.map(
            db.Project.query('primary', { pk: {}, '>=': null }),
            ({ items }) => ({ ...task, owner: items[0]?.value.lead ?? 'none' }),
          ),
      })
      .backfill('project-lead', {
        entity: 'Project',
        to: 'v2',
        run: (project) => Effect.succeed({ ...project, lead: 'ann' }),
      })
      .build();
    const failure = expectTableShippable(table, never);
    await expect(failure).rejects.toThrow(
      /Every Backfill pending at once[^\n]*\("task-owner", "project-lead"\): Backfill "task-owner" [^\n]*\n {2}stored Task row: [^\n]*\n {2}stored Project row: [^\n]*"_v":"v1"/,
    );
    // Each one alone passes: only the schedule shows it.
    await expect(failure).rejects.not.toThrow(/^Backfill "/m);
  });

  it('starts each entity at its earliest gap, whatever order its Backfills were declared in', async () => {
    const Area = EntityESchema.make('Area', 'areaId', { name: Schema.String })
      .evolve('v2', { code: Schema.String })
      .evolve('v3', { label: Schema.String })
      .build();
    const Zone = EntityESchema.make('Zone', 'zoneId', { name: Schema.String })
      .evolve('v2', { code: Schema.String })
      .build();
    // Area's v2 Backfill reads every Zone, without waiting for Zone's own:
    // only a database with v1 Areas and v1 Zones shows it.
    const table = StdTable.make('regions')
      .primary('pk', 'sk')
      .entity(Area, (e) => e.primary())
      .entity(Zone, (e) => e.primary())
      .backfill('area-label', {
        entity: 'Area',
        to: 'v3',
        run: (area) => Effect.succeed({ ...area, label: 'l' }),
      })
      .backfill('zone-code', {
        entity: 'Zone',
        to: 'v2',
        run: (zone) => Effect.succeed({ ...zone, code: 'z' }),
      })
      .backfill('area-code', {
        entity: 'Area',
        to: 'v2',
        run: (area, db) =>
          Effect.map(
            db.Zone.query('primary', { pk: {}, '>=': null }),
            ({ items }) => ({ ...area, code: items[0]?.value.code ?? 'none' }),
          ),
      })
      .build();
    await expect(expectTableShippable(table, never)).rejects.toThrow(
      /Every Backfill pending at once[^\n]*: Backfill "area-code" [^\n]*\n {2}stored Area row: [^\n]*"_v":"v1"/,
    );
  });

  it('passes the same Backfills once the Task one runs after the Project one', async () => {
    const table = StdTable.make('board')
      .primary('pk', 'sk')
      .entity(Task, (e) => e.primary({ pk: ['projectId'] }))
      .entity(Project, (e) => e.primary())
      .backfill('project-lead', {
        entity: 'Project',
        to: 'v2',
        run: (project) => Effect.succeed({ ...project, lead: 'ann' }),
      })
      .backfill('task-owner', {
        entity: 'Task',
        to: 'v2',
        after: ['project-lead'],
        run: (task, db) =>
          Effect.map(
            db.Project.query('primary', { pk: {}, '>=': null }),
            ({ items }) => ({ ...task, owner: items[0]?.value.lead ?? 'none' }),
          ),
      })
      .build();
    await expectTableShippable(
      table,
      './fixtures/board-backfills.snapshot.json',
    );
  });
});
