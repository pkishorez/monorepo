import { Effect } from 'effect';
import type {
  ContractSnapshot,
  ESchemaSnapshot,
  TableSnapshot,
} from '../../domain/index.js';
import { SnapshotDecodeError } from '../../domain/index.js';
import {
  decodeSnapshotDocumentV1,
  decodeTableSnapshotV1,
} from './snapshot-document.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function refsIn(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => refsIn(item, output));
  } else if (isRecord(value)) {
    if (value._tag === 'ESchemaRef' && typeof value.identity === 'string') {
      output.add(value.identity);
    }
    Object.values(value).forEach((item) => refsIn(item, output));
  }
  return output;
}

function validateESchema(input: ESchemaSnapshot): ESchemaSnapshot {
  const identities = new Set<string>();
  for (const rawDefinition of input.schemas) {
    if (identities.has(rawDefinition.identity)) {
      throw new SnapshotDecodeError(
        `Duplicate ESchema identity: ${rawDefinition.identity}`,
      );
    }
    identities.add(rawDefinition.identity);
    rawDefinition.versions.forEach((rawVersion, index) => {
      if (rawVersion.version !== `v${index + 1}`) {
        throw new SnapshotDecodeError(
          `Non-contiguous or malformed version history: ${rawDefinition.identity}`,
        );
      }
    });
  }
  if (!identities.has(input.root)) {
    throw new SnapshotDecodeError(`Missing root ESchema: ${input.root}`);
  }
  for (const rawDefinition of input.schemas) {
    for (const version of rawDefinition.versions) {
      for (const reference of refsIn([version.encoded, version.decoded])) {
        if (!identities.has(reference)) {
          throw new SnapshotDecodeError(`Dangling ESchemaRef: ${reference}`);
        }
      }
    }
  }
  return input as unknown as ESchemaSnapshot;
}

function validateTable(input: TableSnapshot): TableSnapshot {
  if (
    input._v !== 'v1' ||
    !['dynamodb', 'sqlite', 'idb'].includes(input.adapter) ||
    (input.logicalName !== undefined &&
      typeof input.logicalName !== 'string') ||
    !isRecord(input.primaryIndex) ||
    typeof input.primaryIndex.pk !== 'string' ||
    typeof input.primaryIndex.sk !== 'string' ||
    !Array.isArray(input.secondaryIndexes) ||
    !Array.isArray(input.entities) ||
    !Array.isArray(input.schemas)
  ) {
    throw new SnapshotDecodeError('Malformed table snapshot');
  }
  const schemaSnapshot =
    input.schemas.length === 0
      ? { schemas: [] as const }
      : validateESchema({
          _v: 'v1',
          kind: 'eschema',
          root: input.schemas[0]!.identity,
          schemas: input.schemas,
        });
  const schemas = new Set(
    schemaSnapshot.schemas.map(({ identity }) => identity),
  );
  const indexNames = new Set<string>();
  for (const index of input.secondaryIndexes) {
    if (indexNames.has(index.name)) {
      throw new SnapshotDecodeError(`Duplicate table index: ${index.name}`);
    }
    indexNames.add(index.name);
  }
  const entityNames = new Set<string>();
  for (const entity of input.entities) {
    if (entityNames.has(entity.name)) {
      throw new SnapshotDecodeError(`Duplicate table entity: ${entity.name}`);
    }
    entityNames.add(entity.name);
    if (!schemas.has(entity.schema)) {
      throw new SnapshotDecodeError(
        `Dangling entity schema ref: ${entity.schema}`,
      );
    }
    const derivationNames = new Set<string>();
    for (const derivation of entity.secondaryDerivations) {
      if (derivationNames.has(derivation.name)) {
        throw new SnapshotDecodeError(
          `Duplicate entity index: ${entity.name}/${derivation.name}`,
        );
      }
      derivationNames.add(derivation.name);
      if (!indexNames.has(derivation.physicalIndex)) {
        throw new SnapshotDecodeError(
          `Dangling physical index ref: ${derivation.physicalIndex}`,
        );
      }
    }
  }
  return input;
}

function decode(
  input: unknown,
): Effect.Effect<ContractSnapshot, SnapshotDecodeError> {
  if (!isRecord(input)) {
    return Effect.fail(new SnapshotDecodeError('Snapshot must be an object'));
  }
  if (input.kind === 'eschema') {
    if (input._v !== 'v1') {
      return Effect.fail(
        new SnapshotDecodeError('Unsupported ESchema snapshot format'),
      );
    }
    return decodeSnapshotDocumentV1(input).pipe(
      Effect.flatMap((snapshot) =>
        Effect.try({
          try: () => validateESchema(snapshot),
          catch: (error) =>
            error instanceof SnapshotDecodeError
              ? error
              : new SnapshotDecodeError('Snapshot decode failed', error),
        }),
      ),
    );
  }
  if (input.kind === 'table') {
    return decodeTableSnapshotV1(input).pipe(
      Effect.flatMap((snapshot) =>
        Effect.try({
          try: () => validateTable(snapshot),
          catch: (error) =>
            error instanceof SnapshotDecodeError
              ? error
              : new SnapshotDecodeError('Snapshot decode failed', error),
        }),
      ),
    );
  }
  return Effect.fail(new SnapshotDecodeError('Unknown snapshot kind'));
}

export { decode as decodeSnapshot, validateTable as validateTableSnapshot };
