import { Effect, Schema } from 'effect';
import { ESchema } from '../../eschema/eschema.js';
import type { ESchemaSnapshot, TableSnapshot } from '../model.js';
import { SnapshotDecodeError } from '../model.js';

const markerSchema = Schema.Struct({
  path: Schema.String,
  kind: Schema.String,
  message: Schema.String,
});

const transformationSchema = Schema.Struct({
  path: Schema.String,
  name: Schema.String,
});

const versionSchema = Schema.Struct({
  version: Schema.String,
  encoded: Schema.Json,
  decoded: Schema.Json,
  transformations: Schema.Array(transformationSchema),
  unverifiable: Schema.Array(markerSchema),
});

const definitionSchema = Schema.Struct({
  identity: Schema.String,
  kind: Schema.Literals(['struct', 'value', 'entity', 'single-entity']),
  idField: Schema.NullOr(Schema.String),
  versions: Schema.Array(versionSchema),
});

const derivationSchema = Schema.Struct({
  pk: Schema.Array(Schema.String),
  sk: Schema.Array(Schema.String),
});

const secondaryDerivationSchema = Schema.Struct({
  name: Schema.String,
  physicalIndex: Schema.String,
  ...derivationSchema.fields,
});

const tableSnapshotV1Schema = Schema.Struct({
  _v: Schema.Literal('v1'),
  kind: Schema.Literal('table'),
  adapter: Schema.Literals(['dynamodb', 'sqlite', 'idb']),
  primaryIndex: Schema.Struct({
    pk: Schema.String,
    sk: Schema.String,
  }),
  secondaryIndexes: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      kind: Schema.Literals(['gsi', 'lsi', 'secondary', 'sparse']),
      pk: Schema.String,
      sk: Schema.String,
    }),
  ),
  entities: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      kind: Schema.Literals(['keyed', 'singleton']),
      idField: Schema.NullOr(Schema.String),
      schema: Schema.String,
      primaryDerivation: derivationSchema,
      secondaryDerivations: Schema.Array(secondaryDerivationSchema),
    }),
  ),
  schemas: Schema.Array(definitionSchema),
});

const snapshotDocumentV1 = ESchema.make('SnapshotDocument', {
  kind: Schema.Literal('eschema'),
  root: Schema.String,
  schemas: Schema.Array(definitionSchema),
}).build();

/** Decodes the v1 snapshot document through its internal ESchema. */
export function decodeSnapshotDocumentV1(
  input: unknown,
): Effect.Effect<ESchemaSnapshot, SnapshotDecodeError> {
  return snapshotDocumentV1.decode(input).pipe(
    Effect.map(
      (snapshot) => ({ ...snapshot, _v: 'v1' }) as unknown as ESchemaSnapshot,
    ),
    Effect.mapError(
      (cause) => new SnapshotDecodeError('Malformed ESchema snapshot', cause),
    ),
  );
}

/** Decodes a v1 table snapshot document. */
export function decodeTableSnapshotV1(
  input: unknown,
): Effect.Effect<TableSnapshot, SnapshotDecodeError> {
  return Schema.decodeUnknownEffect(tableSnapshotV1Schema)(input).pipe(
    Effect.mapError(
      (cause) => new SnapshotDecodeError('Malformed table snapshot', cause),
    ),
  );
}
