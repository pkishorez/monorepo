export { TableSnapshot } from './snapshot/index.js';
export type {
  EntitySource,
  KeyedEntitySource,
  SingleEntitySource,
  TableSource,
} from './capture/table-capture/index.js';
export type {
  RestoredESchema,
  RestoredESchemaVersion,
} from './restore/eschema-restore/index.js';
export {
  SnapshotChangeSchema,
  SnapshotDecodeError,
  SnapshotIdentityConflict,
  SnapshotIncompatible,
  TableSnapshotESchema,
} from './domain/index.js';
export type {
  ESchemaDefinition,
  JsonValue,
  SnapshotChange,
  SnapshotImpact,
  SnapshotEdit,
  SnapshotSubject,
  SnapshotSubjectKind,
  TableAccessPatternSnapshot,
  TableEntitySnapshot,
  TableIndexSnapshot,
  TableTopologySnapshot,
} from './domain/index.js';
