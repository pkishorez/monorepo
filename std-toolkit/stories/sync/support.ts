import { Effect, Schema } from 'effect';
import type { DecodedEntity } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

import { Simulation, type BackendEntity } from './simulation/index.js';

export { Simulation };
export type {
  BackendEntity,
  CollectionDefinition,
  TransactionHandle,
  WriteGate,
} from './simulation/index.js';

// Public simulation DSL

/**
 * Story vocabulary:
 *
 * - `backend.insert/update/remove('CollectionName', ...)`
 * - `browser('alice').insert/update/remove('CollectionName', ...)`
 * - `browser('alice').mount({ name, query })` and `.unmount(liveQuery)`
 * - `browser('alice').tab('second')` for another tab with its own Sync Replica
 * - `browser('alice').transact(label, ({ collection }) => ...)`
 * - `backend.holdNextWrite` for deterministic optimistic success or failure
 * - `browser('alice').disconnect` and `.reconnect`
 * - `browser('alice').hide/show/freeze/resume/close`
 * - `liveQuery.shows(rows)` and `.eventuallyShows(rows)`
 */

// Todo fixture shared by the Sync stories

export const TodoSchema = EntityESchema.make('Todo', 'todoId', {
  listId: Schema.String,
  title: Schema.String,
  done: Schema.Boolean,
}).build();

export type Todo = typeof TodoSchema.Type;
export type TodoEntity = DecodedEntity<Todo>;
export type TodoKey = { todoId: string; listId: string };

export const storyTable = StdTable.make('sync-stories')
  .primary('pk', 'sk')
  .build();

export const todoEntity = storyTable
  .entity(TodoSchema)
  .primary({ pk: ['listId'] })
  .build();

const byUpdateStamp = (left: TodoEntity, right: TodoEntity) =>
  left.meta._u < right.meta._u ? -1 : 1;

export const todoSource = (
  backend: BackendEntity<typeof todoEntity>,
  listId: string,
) => {
  const all = backend
    .query('primary', { pk: { listId }, '>=': null })
    .pipe(Effect.map((page) => [...page.items].sort(byUpdateStamp)));
  return {
    pageNewer: (cursor: TodoEntity | null, limit: number) =>
      all.pipe(
        Effect.map((entities) =>
          entities
            .filter(
              (entity) => cursor === null || entity.meta._u > cursor.meta._u,
            )
            .slice(0, limit),
        ),
      ),
    pageOlder: (cursor: TodoEntity | null, limit: number) =>
      all.pipe(
        Effect.map((entities) =>
          entities
            .filter(
              (entity) => cursor === null || entity.meta._u < cursor.meta._u,
            )
            .slice(-limit),
        ),
      ),
    changes: (cursor: TodoEntity | null) =>
      backend.changes({
        cursor,
        includes: (entity) => entity.value.listId === listId,
        catchUp: (from) =>
          all.pipe(
            Effect.map((entities) =>
              entities.filter(
                (entity) => from === null || entity.meta._u > from.meta._u,
              ),
            ),
          ),
      }),
  };
};
