import { Effect, Exit, Schema, Stream } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import type { MemoryTable } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/schema';

/*
 * The hero's data: a task, as three releases of an app shape it. Release 1
 * has a title; release 2 adds a priority; release 3 adds done. Each release
 * declares its Task on its own definition of the same table, 'board', and
 * all three run against one table in memory, so each reads what the
 * others saved: older rows upgraded, newer ones refused as too new.
 */

const fields = { boardId: Schema.String, title: Schema.String };

const V1 = EntityESchema.make('Task', 'taskId', fields).build();
const V2 = EntityESchema.make('Task', 'taskId', fields)
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();
const V3 = EntityESchema.make('Task', 'taskId', fields)
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .evolve('v3', { done: Schema.Boolean }, (v2) => ({ ...v2, done: false }))
  .build();

const board1 = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(V1, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const board2 = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(V2, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(V3, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const tasks = [board1.Task, board2.Task, table.Task] as const;

export type Release = 1 | 2 | 3;

/** One task as a release reads it, beside the version it is stored at. */
export type Seen = {
  readonly taskId: string;
  readonly stored: string;
  readonly read:
    | {
        readonly title: string;
        readonly priority?: string;
        readonly done?: boolean;
      }
    | { readonly tooNew: true };
};

const TITLES = [
  'Plan the week',
  'Water the plants',
  'Call home',
  'Fix the bike',
  'Book the dentist',
  'Return the books',
];

/** The board, kept in memory: nothing outlives the page. */
export const board = (): MemoryTable<'board'> => Memory.make(table);

/** Saves the `count`th task with a release, in the shape it knows. */
export const save = (
  memory: MemoryTable<'board'>,
  release: Release,
  count: number,
) => {
  const base = {
    boardId: 'home',
    taskId: `t${String(count + 1).padStart(2, '0')}`,
    title: TITLES[count % TITLES.length]!,
  };
  const saved =
    release === 1
      ? tasks[0].insert(base)
      : release === 2
        ? tasks[1].insert({ ...base, priority: 'high' })
        : tasks[2].insert({ ...base, priority: 'high', done: true });
  return saved.pipe(Effect.asVoid, Effect.provide(memory.layer));
};

/** Every task on the board, as a release reads it. */
export const read = (memory: MemoryTable<'board'>, release: Release) =>
  Effect.gen(function* () {
    const rows = yield* Stream.runCollect(table.scan());
    return yield* Effect.forEach([...rows], (row) =>
      Effect.gen(function* () {
        const key = {
          boardId: String(row.data.boardId),
          taskId: String(row.data.taskId),
        };
        const exit = yield* Effect.exit(tasks[release - 1].get(key));
        // Each release reads a Task of its own shape: the latest has them all.
        const value = (Exit.isSuccess(exit) ? exit.value?.value : undefined) as
          | { title: string; priority?: string; done?: boolean }
          | undefined;
        return {
          taskId: key.taskId,
          stored: String(row.data._v ?? 'v1'),
          read: value
            ? {
                title: value.title,
                ...(value.priority !== undefined
                  ? { priority: value.priority }
                  : {}),
                ...(value.done !== undefined ? { done: value.done } : {}),
              }
            : { tooNew: true as const },
        } satisfies Seen;
      }),
    );
  }).pipe(Effect.provide(memory.layer));
