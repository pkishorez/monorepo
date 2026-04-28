import type { AnyEntityESchema, ESchemaEncoded } from '@std-toolkit/eschema';
import type { SQLiteEntity } from '../services/sqlite-entity.js';
import type { StoredIndexDerivation } from '../internal/utils.js';
import { StdToolkitError } from '@std-toolkit/core/rpc';
import { SqliteDBError } from '../sql/db.js';
import type { EntityRow, EntityType } from '@std-toolkit/core';

export type AnySQLiteEntity<S extends AnyEntityESchema = AnyEntityESchema> =
  SQLiteEntity<Record<string, StoredIndexDerivation>, S, string>;

export const mapError = (error: SqliteDBError): StdToolkitError =>
  new StdToolkitError({
    message: error._tag,
    code: error._tag,
  });

/**
 * Drops the server-only `decoded` Effect from a row before it crosses an RPC
 * boundary (the wire schema is `EntityType<ESchemaEncoded<S>>`, no closures).
 */
export const stripDecoded = <S extends AnyEntityESchema>(
  row: EntityRow<S>,
): EntityType<ESchemaEncoded<S>> => ({ value: row.value, meta: row.meta });
