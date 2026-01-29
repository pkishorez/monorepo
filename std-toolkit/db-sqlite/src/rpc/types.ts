import type { AnyESchema } from "@std-toolkit/eschema";
import type { SQLiteEntity } from "../services/sqlite-entity.js";
import type { StoredIndexDerivation, StoredTimelineDerivation } from "../internal/utils.js";
import { StdToolkitError } from "@std-toolkit/core/rpc";
import { SqliteDBError } from "../sql/db.js";

export type AnySQLiteEntity<S extends AnyESchema = AnyESchema> = SQLiteEntity<
  Record<string, StoredIndexDerivation>,
  S,
  string,
  StoredTimelineDerivation | null
>;

export const mapError = (error: SqliteDBError): StdToolkitError =>
  new StdToolkitError({
    message: error._tag,
    code: error._tag,
  });
