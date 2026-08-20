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

// Note fixture shared by the Sync stories

export const NoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  pinned: Schema.Boolean,
}).build();

export type Note = typeof NoteSchema.Type;
export type NoteEntity = DecodedEntity<Note>;
export type NoteKey = { noteId: string; notebook: string };

export const storyTable = StdTable.make('sync-stories')
  .primary('pk', 'sk')
  .build();

export const noteEntity = storyTable
  .entity(NoteSchema)
  .primary({ pk: ['notebook'] })
  .build();

const byUpdateStamp = (left: NoteEntity, right: NoteEntity) =>
  left.meta._u < right.meta._u ? -1 : 1;

export const noteSource = (
  backend: BackendEntity<typeof noteEntity>,
  notebook: string,
) => {
  const all = backend
    .query('primary', { pk: { notebook }, '>=': null })
    .pipe(Effect.map((page) => [...page.items].sort(byUpdateStamp)));
  return {
    pageNewer: (cursor: NoteEntity | null, limit: number) =>
      all.pipe(
        Effect.map((entities) =>
          entities
            .filter(
              (entity) => cursor === null || entity.meta._u > cursor.meta._u,
            )
            .slice(0, limit),
        ),
      ),
    pageOlder: (cursor: NoteEntity | null, limit: number) =>
      all.pipe(
        Effect.map((entities) =>
          entities
            .filter(
              (entity) => cursor === null || entity.meta._u < cursor.meta._u,
            )
            .slice(-limit),
        ),
      ),
    changes: (cursor: NoteEntity | null) =>
      backend.changes({
        cursor,
        includes: (entity) => entity.value.notebook === notebook,
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
