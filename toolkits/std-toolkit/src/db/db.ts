import { StdTable as Builder } from './table/std-table/index.js';
import type {
  GlobalSecondaryIndexMap,
  LocalSecondaryIndexMap,
  PrimaryIndex,
} from './table/model/definition/index.js';
import { migrate, runMigration } from './setup/index.js';

// Change Notices: every saved write is announced to the subscribers of its
// entity, in one tab or across a browser's tabs.
export {
  Broadcaster,
  defaultBroadcaster,
  sharedBroadcaster,
  type ChangeNotice,
} from './table/broadcaster/index.js';

export type {
  EntitiesBuilder,
  StdTable as BuiltTable,
  TableBuilder,
  TopologyBuilder,
} from './table/std-table/index.js';

/** A built table: the table-wide surface, with each entity under its name. */
export type StdTable<
  Name extends string = string,
  Primary extends PrimaryIndex = PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap = LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap = GlobalSecondaryIndexMap,
> = Builder<Name, Primary, Lsis, Gsis>;

/**
 * `StdTable.make` declares a table. `StdTable.migrate` moves every row of an
 * old table into a new one once, and `StdTable.runMigration` runs that to
 * its end, logging each step.
 */
export const StdTable = Object.freeze({
  make: Builder.make,
  migrate,
  runMigration,
});

export {
  MigrationRefused,
  MigrationRowFailed,
  type MigrationCounts,
  type MigrationError,
  type MigrationEvent,
  type MigrationHandlers,
  type MigrationOptions,
  type MigrationRefusedReason,
  type MigrationTables,
  type ReadOnlyEntities,
} from './setup/index.js';
export type {
  AccessPatternDefinition,
  GlobalSecondaryIndex,
  KeyedEntityDefinition,
  KeyPath,
  KeyPathValue,
  LocalSecondaryIndex,
  PrimaryIndex,
  SingleEntityDefinition,
  TableDefinition,
  TotalKeyPath,
} from './table/model/definition/index.js';
export type {
  KeyedEntity,
  QueryOptions,
  QueryPage,
  SingleEntity,
} from './table/entity/index.js';
export type { StdTableService } from './table/model/contract/index.js';
export {
  DatabaseError,
  type DatabaseErrorReason,
  type TransactOperation,
  type TransactOutcome,
} from './table/model/error/index.js';
