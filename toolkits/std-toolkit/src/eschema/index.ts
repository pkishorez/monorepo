export { ESchema } from './eschema/index.js';
export { EntityESchema } from './entity-eschema/index.js';
export { ValueESchema } from './value-eschema/index.js';
export {
  ESchemaError,
  NeedsBackfill,
  OutdatedVersion,
  findNeedsBackfill,
  findOutdatedVersion,
} from './domain/eschema-error/index.js';
export { eschemaOf } from './domain/versioned-schema/index.js';
// What a Backfill runner needs: which versions are gaps, and the pure steps
// between them. A Backfill itself is db's; eschema never runs one.
export { gapVersions } from './domain/introspection/index.js';
export {
  migrateToGap,
  readToGap,
  type VersionedValue,
} from './domain/encoded/index.js';
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
  AnyEvolvingSchema,
  EntitySchemaOf,
  ESchemaIdField,
  ESchemaType,
  ESchemaVersions,
  GapVersions,
  PreviousVersion,
  SingleEntitySchemaOf,
  ValueEnvelopeEncoded,
  VersionedCodec,
  VersionValue,
  // Named in every ESchema's type, so a declaration build can refer to them.
  AppendVersion,
  VersionShape,
  VersionShapes,
} from './domain/schema-model/index.js';
