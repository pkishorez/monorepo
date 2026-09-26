export { StdTable } from './std-table/table/index.js';
export type {
  AccessPatternDefinition,
  GlobalSecondaryIndex,
  KeyedEntityDefinition,
  KeyPath,
  KeyPathValue,
  PrimaryIndex,
  SingleEntityDefinition,
  TableDefinition,
  TotalKeyPath,
} from './std-table/definition/index.js';
export type {
  KeyedEntity,
  QueryOptions,
  QueryPage,
} from './std-table/entity/index.js';
export type { StdTableService } from './std-table/contract/index.js';
export {
  DatabaseError,
  type DatabaseErrorReason,
  type TransactOperation,
  type TransactOutcome,
} from './std-table/error/index.js';
