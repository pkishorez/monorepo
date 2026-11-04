export { ESchema } from './makers/eschema/index.js';
export { EntityESchema } from './makers/entity-eschema/index.js';
export { ValueESchema } from './makers/value-eschema/index.js';
export {
  ESchemaError,
  OutdatedVersion,
  findOutdatedVersion,
} from './model/eschema-error/index.js';
export { eschemaOf } from './codec/versioned-schema/index.js';
// The snapshot type language: how a snapshot describes a field's stored
// shape, and the annotation that names a check the catalogue does not know.
export {
  checkAnnotation,
  SnapshotTypeSchema,
  type CheckDescription,
  type SnapshotCheck,
  type SnapshotStructField,
  type SnapshotType,
} from './model/snapshot-type/index.js';
export type {
  AnyESchema,
  AnyUnkeyedESchema,
  AnyEntityESchema,
  AnyEvolvingSchema,
  EntitySchemaOf,
  ESchemaIdField,
  ESchemaType,
  SingleEntitySchemaOf,
  ValueEnvelopeEncoded,
  VersionedCodec,
} from './model/schema-model/index.js';
