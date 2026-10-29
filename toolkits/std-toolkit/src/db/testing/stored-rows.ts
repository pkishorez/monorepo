import { Arbitrary, Effect } from 'effect';
import { nextUlid } from '../../core/index.js';
import { storableRows } from '../../eschema/testing/index.js';
import type { StoredData, StoredItem } from '../std-table/contract/index.js';
import type { RegisteredEntity } from '../std-table/definition/index.js';
import type { DatabaseError } from '../std-table/error/index.js';
import { makeStoredItem, singleKey } from '../std-table/entity/index.js';
import { storedForm, type StdTable } from '../std-table/table/index.js';

// Generated rows a table could hold: values valid at one version of an
// entity, in that version's encoded form, stamped with it.

/** One generated row: the value it was written from, and its stored data. */
export interface GeneratedRow {
  readonly value: unknown;
  readonly data: StoredData;
}

/**
 * Rows `entity` can store at `version`. A value the version cannot store as
 * JSON is discarded, since no such row can exist.
 */
export const rowsAt = (
  entity: RegisteredEntity,
  version: string,
): Arbitrary.Arbitrary<GeneratedRow> =>
  Arbitrary.map(
    storableRows(entity.schema, version),
    ({ value, stored }): GeneratedRow => ({
      value,
      data: stored as StoredData,
    }),
  );

/** Rows of `entity` at its latest version. */
export const latestRows = (
  entity: RegisteredEntity,
): Arbitrary.Arbitrary<GeneratedRow> =>
  rowsAt(entity, entity.schema.latestVersion);

/**
 * The stored item of a row at an old version, keyed from its value as it
 * was then. Only setup rewrites it, with fresh keys.
 */
export const oldItem = (
  entity: RegisteredEntity,
  row: GeneratedRow,
): Effect.Effect<StoredItem> =>
  Effect.map(nextUlid, (updated) =>
    entity.kind === 'keyed'
      ? makeStoredItem(
          entity,
          row.value as object,
          {
            value: row.data,
            meta: { _e: entity.name, _u: updated, _d: false, _v: row.data._v },
          },
          updated,
          false,
        )
      : {
          ...singleKey(entity.name),
          meta: { _e: entity.name, _u: updated, _d: false },
          data: row.data,
          keys: {},
        },
  );

/** The stored item of a latest row, written as the table writes it. */
export const latestItem = (
  table: StdTable,
  entity: RegisteredEntity,
  row: GeneratedRow,
): Effect.Effect<StoredItem, DatabaseError> =>
  Effect.flatMap(nextUlid, (updated) =>
    storedForm(table, entity.name, row.value as object, {
      _u: updated,
      _d: false,
    }),
  );
