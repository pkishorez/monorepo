// New single-table design (like DynamoDB)
export { SQLiteTable, SQLiteEntity } from "./services/index.js";
export type {
  SQLiteTableConfig,
  SQLiteTableInstance,
  IndexDefinition,
  QueryResult as TableQueryResult,
  KeyConditionParameters,
  SortKeyCondition,
  EntityType,
} from "./services/index.js";
export { EntityRegistry } from "./registry/index.js";

// Internal utilities
export type {
  KeyOp,
  SkParam,
  RowMeta,
  SimpleQueryOptions,
  SubscribeOptions,
  Operator,
} from "./internal/index.js";
export {
  deriveIndexKeyValue,
  extractKeyOp,
  getKeyOpOrderDirection,
  getKeyOpScanDirection,
} from "./internal/index.js";

// SQL layer
export {
  SqliteDB,
  SqliteDBError,
  type SqliteDBErrorType,
  SqliteDBBetterSqlite3,
  SqliteDBDO,
  where,
  whereNone,
  whereEquals,
  whereAnd,
  wherePkSk,
  wherePkSkExact,
  type Where,
} from "./sql/index.js";

// Legacy exports (deprecated - use new single-table design)
export { SQLiteTable as LegacySQLiteTable } from "./table/index.js";
export type { QueryResult, KeyOp as LegacyKeyOp, RowMeta as LegacyRowMeta } from "./table/index.js";
export { DatabaseRegistry } from "./registry/index.js";
