/*
 * Schema: what a row is. An Entity is a value with its meta, an ESchema
 * says each version of the value and upgrades old ones to the latest, and a
 * Table Snapshot, its own subpath, describes the contract a table keeps.
 */
export {
  EntityMetaSchema,
  nextUlid,
  SingleEntityMetaSchema,
  StdToolkitError,
  Ulid,
  uTime,
  type Entity,
  type EntityMeta,
  type SingleEntityMeta,
  type SingletonEntity,
} from './entity/index.js';
export {
  checkAnnotation,
  EntityESchema,
  ESchema,
  ESchemaError,
  eschemaOf,
  findOutdatedVersion,
  OutdatedVersion,
  SnapshotTypeSchema,
  ValueESchema,
  type AnyEntityESchema,
  type AnyESchema,
  type AnyEvolvingSchema,
  type AnyUnkeyedESchema,
  type CheckDescription,
  type EntitySchemaOf,
  type ESchemaIdField,
  type ESchemaType,
  type SingleEntitySchemaOf,
  type SnapshotCheck,
  type SnapshotStructField,
  type SnapshotType,
  type ValueEnvelopeEncoded,
  type VersionedCodec,
} from './eschema/index.js';
