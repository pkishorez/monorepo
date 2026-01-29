// Single-table design (like DynamoDB)
export {
  SQLiteTable,
  SQLiteEntity,
  type EntityType,
  type SQLiteTableConfig,
  type IndexDefinition,
  type QueryResult,
  type KeyConditionParameters,
  type SortKeyCondition,
  type SQLiteTableInstance,
} from "./services/index.js";
export { EntityRegistry } from "./registry/index.js";
export { SqliteDB, SqliteDBError, type SqliteDBErrorType } from "./sql/index.js";
export type {
  RawRow,
  SkParam,
  SimpleQueryOptions,
  SubscribeOptions,
  StoredIndexDerivation,
  StoredPrimaryDerivation,
  StoredTimelineDerivation,
} from "./internal/utils.js";
