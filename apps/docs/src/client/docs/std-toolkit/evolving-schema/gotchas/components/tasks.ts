import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import {
  EntityESchema,
  findOutdatedVersion,
} from '@kestack/std-toolkit/eschema';

const fields = { boardId: Schema.String, title: Schema.String };

// The release still running in an old tab: it only knows v1.
export const TaskV1 = EntityESchema.make('Task', 'taskId', fields).build();

// The release just shipped: it added v2.
export const Task = EntityESchema.make('Task', 'taskId', fields)
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// Both work against the one 'board' table.
export const table = StdTable.make('board').primary('pk', 'sk').build();
export const oldRelease = table
  .entity(TaskV1)
  .primary({ pk: ['boardId'] })
  .build();

const newReleaseTable = StdTable.make('board').primary('pk', 'sk').build();
export const newRelease = newReleaseTable
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// The board, as the old release reads it: a row too new says so.
export const oldBoard = oldRelease
  .query('primary', { pk: { boardId: 'work' }, '>=': null })
  .pipe(
    Effect.map((page) => page.items.map((item) => item.value)),
    Effect.mapError((error) => {
      const outdated = findOutdatedVersion(error);
      return outdated
        ? new Error(
            `OutdatedVersion: ${outdated.schema} ${outdated.version}, but this release knows up to ${outdated.latestVersion}`,
          )
        : error;
    }),
  );
