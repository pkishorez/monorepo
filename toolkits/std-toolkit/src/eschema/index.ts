export { ESchema } from './eschema/index.js';
export { EntityESchema } from './entity-eschema/index.js';
export { ValueESchema } from './value-eschema/index.js';
export { toSchema } from './schema-composition/index.js';
export { ESchemaError, OutdatedVersion } from './domain/eschema-error/index.js';
// The snapshot type language: how a snapshot describes a field's stored
// shape, and the annotation that names a check the catalogue does not know.
export {
  checkAnnotation,
  SnapshotTypeSchema,
  type CheckDescription,
  type SnapshotCheck,
  type SnapshotStructField,
  type SnapshotType,
} from './domain/snapshot-type/index.js';
export type {
  AnyESchema,
  AnyUnkeyedESchema,
  AnyEntityESchema,
  ESchemaIdField,
  ESchemaType,
} from './domain/schema-model/index.js';
