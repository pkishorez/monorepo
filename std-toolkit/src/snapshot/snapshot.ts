import { Effect } from 'effect';
import type {
  ContractSnapshot,
  ESchemaSnapshot,
  SnapshotChange,
  SnapshotDiagnostic,
  TableEntitySnapshot,
  TableSnapshot,
} from './model.js';
import { SnapshotDecodeError } from './model.js';
import {
  decodeSnapshotDocumentV1,
  decodeTableSnapshotV1,
} from './internal/snapshot-document.js';
import {
  compareStrings,
  stableStringify,
} from './internal/stable-stringify.js';
import {
  renderSnapshot,
  renderSnapshotChanges,
} from './internal/text-render.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function definitionPath(identity: string): string {
  return `/schemas/${escapePointer(identity)}`;
}

const stable = stableStringify;

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

function inspect(snapshot: ContractSnapshot): readonly SnapshotDiagnostic[] {
  const diagnostics = snapshot.schemas
    .flatMap((definition) =>
      definition.versions.flatMap((version) =>
        version.unverifiable.map((marker) => ({
          ...marker,
          path: `${definitionPath(definition.identity)}/versions/${escapePointer(version.version)}${marker.path === '/' ? '' : marker.path}`,
        })),
      ),
    )
    .sort((a, b) =>
      compareStrings(`${a.path}:${a.kind}`, `${b.path}:${b.kind}`),
    );
  return diagnostics;
}

function buildParentMap(
  snapshot: ESchemaSnapshot,
): ReadonlyMap<string, ReadonlySet<string>> {
  const parents = new Map<string, Set<string>>();
  for (const definition of snapshot.schemas) {
    const refs = refsIn(
      definition.versions.flatMap((version) => [
        version.encoded,
        version.decoded,
      ]),
    );
    for (const ref of refs) {
      const values = parents.get(ref) ?? new Set<string>();
      values.add(definition.identity);
      parents.set(ref, values);
    }
  }
  return parents;
}

function parentIdentities(
  parents: ReadonlyMap<string, ReadonlySet<string>>,
  childIdentity: string,
): readonly string[] {
  const found = new Set<string>();
  const pending = [...(parents.get(childIdentity) ?? [])];
  while (pending.length > 0) {
    const identity = pending.shift()!;
    if (found.has(identity)) continue;
    found.add(identity);
    pending.push(...(parents.get(identity) ?? []));
  }
  return [...found].sort();
}

function diffESchema(
  previous: ESchemaSnapshot,
  current: ESchemaSnapshot,
): SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  const beforeDefinitions = new Map(
    previous.schemas.map((item) => [item.identity, item]),
  );
  const afterDefinitions = new Map(
    current.schemas.map((item) => [item.identity, item]),
  );
  const parentMap = buildParentMap(current);

  for (const definition of current.schemas) {
    const before = beforeDefinitions.get(definition.identity);
    const base = definitionPath(definition.identity);
    if (before === undefined) {
      changes.push({
        path: base,
        scope: 'eschema',
        kind: 'definition-added',
        classification: 'safe',
        message: `Added ESchema ${definition.identity}`,
        after: definition,
      });
      continue;
    }
    if (before.kind !== definition.kind) {
      changes.push({
        path: `${base}/kind`,
        scope: 'eschema',
        kind: 'kind-changed',
        classification: 'breaking',
        message: `Changed ${definition.identity} kind`,
        before: before.kind,
        after: definition.kind,
      });
    }
    if (before.idField !== definition.idField) {
      changes.push({
        path: `${base}/idField`,
        scope: 'eschema',
        kind: 'id-field-changed',
        classification: 'breaking',
        message: `Changed ${definition.identity} id field`,
        before: before.idField,
        after: definition.idField,
      });
    }
    const beforeVersions = new Map(
      before.versions.map((item) => [item.version, item]),
    );
    const afterVersions = new Map(
      definition.versions.map((item) => [item.version, item]),
    );
    for (const [versionIndex, version] of definition.versions.entries()) {
      const prior = beforeVersions.get(version.version);
      const versionPath = `${base}/versions/${escapePointer(version.version)}`;
      if (prior === undefined) {
        const classification =
          versionIndex >= before.versions.length ? 'safe' : 'breaking';
        changes.push({
          path: versionPath,
          scope: 'eschema',
          kind: 'version-added',
          classification,
          message:
            classification === 'safe'
              ? `Added next version ${definition.identity} ${version.version}`
              : `Inserted historical version ${definition.identity} ${version.version}`,
          after: version,
        });
        if (classification === 'safe') {
          for (const parent of parentIdentities(
            parentMap,
            definition.identity,
          )) {
            changes.push({
              path: `${definitionPath(parent)}/transitive/${escapePointer(definition.identity)}/${escapePointer(version.version)}`,
              scope: 'eschema',
              kind: 'transitive-version-added',
              classification: 'safe',
              message: `${parent} observes new nested version ${definition.identity} ${version.version}`,
            });
          }
        }
        continue;
      }
      for (const side of ['encoded', 'decoded', 'transformations'] as const) {
        if (stable(prior[side]) !== stable(version[side])) {
          changes.push({
            path: `${versionPath}/${side}`,
            scope: 'eschema',
            kind: `${side}-changed`,
            classification: 'breaking',
            message: `Changed approved ${side} contract for ${definition.identity} ${version.version}`,
            before: prior[side],
            after: version[side],
          });
        }
      }
      const beforeMarkers = new Map(
        prior.unverifiable.map((marker) => [
          `${marker.path}:${marker.kind}`,
          marker,
        ]),
      );
      const afterMarkers = new Map(
        version.unverifiable.map((marker) => [
          `${marker.path}:${marker.kind}`,
          marker,
        ]),
      );
      for (const [key, marker] of afterMarkers) {
        if (!beforeMarkers.has(key)) {
          changes.push({
            path: `${versionPath}/unverifiable/${escapePointer(key)}`,
            scope: 'eschema',
            kind: 'unverifiable-introduced',
            classification: 'unverifiable',
            message: `Introduced unverifiable ${marker.kind} behavior`,
            after: marker,
          });
        }
      }
      for (const [key, marker] of beforeMarkers) {
        if (!afterMarkers.has(key)) {
          changes.push({
            path: `${versionPath}/unverifiable/${escapePointer(key)}`,
            scope: 'eschema',
            kind: 'unverifiable-removed',
            classification: 'unverifiable',
            message: `Removed unverifiable ${marker.kind} behavior`,
            before: marker,
          });
        }
      }
    }
    for (const version of before.versions) {
      if (!afterVersions.has(version.version)) {
        changes.push({
          path: `${base}/versions/${escapePointer(version.version)}`,
          scope: 'eschema',
          kind: 'version-deleted',
          classification: 'breaking',
          message: `Deleted approved version ${definition.identity} ${version.version}`,
          before: version,
        });
      }
    }
  }
  for (const definition of previous.schemas) {
    if (!afterDefinitions.has(definition.identity)) {
      changes.push({
        path: definitionPath(definition.identity),
        scope: 'eschema',
        kind: 'definition-deleted',
        classification: 'breaking',
        message: `Deleted ESchema ${definition.identity}`,
        before: definition,
      });
    }
  }
  return changes;
}

function entityPath(name: string): string {
  return `/entities/${escapePointer(name)}`;
}

function indexPath(name: string): string {
  return `/secondaryIndexes/${escapePointer(name)}`;
}

function addFieldChanges(
  changes: SnapshotChange[],
  base: string,
  scope: SnapshotChange['scope'],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
  classification: SnapshotChange['classification'],
  kindPrefix: string,
): void {
  for (const field of fields) {
    if (stable(before[field]) === stable(after[field])) continue;
    changes.push({
      path: `${base}/${escapePointer(field)}`,
      scope,
      kind: `${kindPrefix}-${field}-changed`,
      classification,
      message: `Changed ${kindPrefix.replaceAll('-', ' ')} ${field}`,
      before: before[field],
      after: after[field],
    });
  }
}

function diffEntity(
  changes: SnapshotChange[],
  before: TableEntitySnapshot,
  after: TableEntitySnapshot,
): void {
  const base = entityPath(after.name);
  addFieldChanges(
    changes,
    base,
    'entity',
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
    ['kind', 'idField', 'schema', 'primaryDerivation'],
    'breaking',
    'entity',
  );
  const prior = new Map(
    before.secondaryDerivations.map((item) => [item.name, item]),
  );
  const current = new Map(
    after.secondaryDerivations.map((item) => [item.name, item]),
  );
  for (const derivation of after.secondaryDerivations) {
    const old = prior.get(derivation.name);
    const path = `${base}/secondaryDerivations/${escapePointer(derivation.name)}`;
    if (old === undefined) {
      changes.push({
        path,
        scope: 'index',
        kind: 'entity-index-added',
        classification: 'requires-backfill',
        message: `Added entity index ${after.name}/${derivation.name}`,
        after: derivation,
      });
    } else {
      addFieldChanges(
        changes,
        path,
        'index',
        old as unknown as Record<string, unknown>,
        derivation as unknown as Record<string, unknown>,
        ['physicalIndex', 'pk', 'sk'],
        'requires-backfill',
        'entity-index',
      );
    }
  }
  for (const derivation of before.secondaryDerivations) {
    if (!current.has(derivation.name)) {
      changes.push({
        path: `${base}/secondaryDerivations/${escapePointer(derivation.name)}`,
        scope: 'index',
        kind: 'entity-index-removed',
        classification: 'safe',
        message: `Removed entity index ${before.name}/${derivation.name}`,
        before: derivation,
      });
    }
  }
}

function diffTable(
  previous: TableSnapshot,
  current: TableSnapshot,
): SnapshotChange[] {
  if (previous.adapter !== current.adapter) {
    return [
      {
        path: '/adapter',
        scope: 'table',
        kind: 'adapter-changed',
        classification: 'unverifiable',
        message: `Cannot compare ${previous.adapter} table with ${current.adapter} table`,
        before: previous.adapter,
        after: current.adapter,
      },
    ];
  }
  const changes: SnapshotChange[] = [];
  addFieldChanges(
    changes,
    '/primaryIndex',
    'index',
    previous.primaryIndex as Record<string, unknown>,
    current.primaryIndex as Record<string, unknown>,
    ['pk', 'sk'],
    'breaking',
    'primary-index',
  );
  const priorIndexes = new Map(
    previous.secondaryIndexes.map((item) => [item.name, item]),
  );
  const currentIndexes = new Map(
    current.secondaryIndexes.map((item) => [item.name, item]),
  );
  for (const index of current.secondaryIndexes) {
    const old = priorIndexes.get(index.name);
    const path = indexPath(index.name);
    if (old === undefined) {
      changes.push({
        path,
        scope: 'index',
        kind: 'secondary-index-added',
        classification: 'requires-backfill',
        message: `Added secondary index ${index.name}`,
        after: index,
      });
    } else {
      addFieldChanges(
        changes,
        path,
        'index',
        old as unknown as Record<string, unknown>,
        index as unknown as Record<string, unknown>,
        ['kind', 'pk', 'sk'],
        'requires-backfill',
        'secondary-index',
      );
    }
  }
  for (const index of previous.secondaryIndexes) {
    if (!currentIndexes.has(index.name)) {
      changes.push({
        path: indexPath(index.name),
        scope: 'index',
        kind: 'secondary-index-removed',
        classification: 'safe',
        message: `Removed secondary index ${index.name}`,
        before: index,
      });
    }
  }
  const priorEntities = new Map(
    previous.entities.map((item) => [item.name, item]),
  );
  const currentEntities = new Map(
    current.entities.map((item) => [item.name, item]),
  );
  for (const entity of current.entities) {
    const old = priorEntities.get(entity.name);
    if (old === undefined)
      changes.push({
        path: entityPath(entity.name),
        scope: 'entity',
        kind: 'entity-added',
        classification: 'safe',
        message: `Added entity ${entity.name}`,
        after: entity,
      });
    else diffEntity(changes, old, entity);
  }
  for (const entity of previous.entities) {
    if (!currentEntities.has(entity.name))
      changes.push({
        path: entityPath(entity.name),
        scope: 'entity',
        kind: 'entity-removed',
        classification: 'breaking',
        message: `Removed entity ${entity.name}`,
        before: entity,
      });
  }
  changes.push(
    ...diffESchema(
      {
        _v: 'v1',
        kind: 'eschema',
        root: previous.schemas[0]?.identity ?? '',
        schemas: previous.schemas,
      },
      {
        _v: 'v1',
        kind: 'eschema',
        root: current.schemas[0]?.identity ?? '',
        schemas: current.schemas,
      },
    ),
  );
  return changes;
}

function diff(
  previous: ContractSnapshot,
  current: ContractSnapshot,
): readonly SnapshotChange[] {
  if (previous.kind === 'table') validateTable(previous);
  if (current.kind === 'table') validateTable(current);
  if (previous.kind !== current.kind) {
    return [
      {
        path: '/kind',
        scope: 'snapshot',
        kind: 'snapshot-kind-changed',
        classification: 'unverifiable',
        message: `Cannot compare ${previous.kind} snapshot with ${current.kind} snapshot`,
        before: previous.kind,
        after: current.kind,
      },
    ];
  }
  const changes =
    previous.kind === 'eschema' && current.kind === 'eschema'
      ? [
          ...(previous.root === current.root
            ? []
            : [
                {
                  path: '/root',
                  scope: 'eschema' as const,
                  kind: 'root-changed',
                  classification: 'breaking' as const,
                  message: 'Changed ESchema root',
                  before: previous.root,
                  after: current.root,
                },
              ]),
          ...diffESchema(previous, current),
        ]
      : previous.kind === 'table' && current.kind === 'table'
        ? diffTable(previous, current)
        : [];
  return changes.sort((a, b) =>
    a.path === b.path
      ? compareStrings(a.kind, b.kind)
      : compareStrings(a.path, b.path),
  );
}

/** Pure snapshot operations, except for Effectful decoding of unknown input. */
export const Snapshot = {
  decode,
  inspect,
  diff,
  render: renderSnapshot,
  renderChanges: renderSnapshotChanges,
} as const;
