import type { AnyEntityESchema } from '../../../eschema/index.js';
import type { SQLiteEntity } from '../services/sqlite-entity.js';
import type { StoredIndexDerivation } from '../internal/utils.js';
import { StdToolkitError } from '../../../core/index.js';
import { SqliteDBError } from '../sql/db.js';

export type AnySQLiteEntity<S extends AnyEntityESchema = AnyEntityESchema> =
  SQLiteEntity<Record<string, StoredIndexDerivation>, S, string>;

export const mapError = (error: SqliteDBError): StdToolkitError =>
  new StdToolkitError({
    message: error._tag,
    code: error._tag,
  });
