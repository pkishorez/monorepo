import type {
  ContractSnapshot,
  ESchemaDefinition,
  ESchemaSnapshot,
  ESchemaVersion,
  SnapshotChange,
  SnapshotImpact,
  SnapshotEdit,
  SnapshotSubject,
  TableAccessPatternSnapshot,
  TableEntitySnapshot,
  TableIndexSnapshot,
  TableSnapshot,
} from '../../domain/index.js';
import { compareStrings, stableStringify } from '../../domain/index.js';
import { validateTableSnapshot as validateTable } from '../snapshot-decoder/index.js';

type EditSide = NonNullable<SnapshotEdit['side']>;
const stable = stableStringify;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function edit(
  path: readonly string[],
  before: unknown,
  after: unknown,
  side?: EditSide,
): SnapshotEdit {
  return {
    ...(side === undefined ? {} : { side }),
    path: [...path],
    ...(before === undefined
      ? {}
      : { before: before as SnapshotEdit['before'] }),
    ...(after === undefined ? {} : { after: after as SnapshotEdit['after'] }),
  };
}

function change(
  subject: SnapshotSubject,
  action: SnapshotChange['action'],
  impact: SnapshotImpact,
  edits: readonly SnapshotEdit[] = [],
): SnapshotChange {
  return { subject, action, impact, edits: [...edits] };
}

function persistentValue(value: unknown): unknown {
  return isRecord(value) && 'type' in value && 'value' in value
    ? value.value
    : value;
}

interface SchemaProperty {
  readonly optional: boolean;
  readonly type: unknown;
}

interface SchemaIndexSignature {
  readonly parameter: unknown;
  readonly type: unknown;
}

function representation(value: unknown): unknown {
  return isRecord(value) && 'representation' in value
    ? value.representation
    : value;
}

function schemaProperties(value: unknown): ReadonlyMap<string, SchemaProperty> {
  const represented = representation(value);
  if (!isRecord(represented) || represented._tag !== 'Objects')
    return new Map();
  const properties = Array.isArray(represented.propertySignatures)
    ? represented.propertySignatures
    : [];
  return new Map(
    properties
      .filter(isRecord)
      .map((property) => [
        String(persistentValue(property.name)),
        { optional: property.isOptional === true, type: property.type },
      ]),
  );
}

function schemaIndexSignatures(
  value: unknown,
): readonly SchemaIndexSignature[] {
  const represented = representation(value);
  if (!isRecord(represented) || represented._tag !== 'Objects') return [];
  const signatures = Array.isArray(represented.indexSignatures)
    ? represented.indexSignatures
    : [];
  return signatures.filter(isRecord).map((signature) => ({
    parameter: signature.parameter,
    type: signature.type,
  }));
}

function schemaEdits(
  before: unknown,
  after: unknown,
  side: EditSide,
  path: readonly string[] = [],
): readonly SnapshotEdit[] {
  if (stable(before) === stable(after)) return [];
  const beforeProperties = schemaProperties(before);
  const afterProperties = schemaProperties(after);
  if (beforeProperties.size === 0 || afterProperties.size === 0) {
    return [edit(path, representation(before), representation(after), side)];
  }

  const edits: SnapshotEdit[] = [];
  const names = new Set([
    ...beforeProperties.keys(),
    ...afterProperties.keys(),
  ]);
  for (const name of [...names].sort(compareStrings)) {
    const previous = beforeProperties.get(name);
    const current = afterProperties.get(name);
    const propertyPath = [...path, name];
    if (previous === undefined) {
      edits.push(edit(propertyPath, undefined, current?.type, side));
      continue;
    }
    if (current === undefined) {
      edits.push(edit(propertyPath, previous.type, undefined, side));
      continue;
    }
    if (previous.optional !== current.optional) {
      edits.push(
        edit(
          [...propertyPath, 'presence'],
          previous.optional ? 'optional' : 'required',
          current.optional ? 'optional' : 'required',
          side,
        ),
      );
    }
    edits.push(...schemaEdits(previous.type, current.type, side, propertyPath));
  }
  const beforeIndexSignatures = schemaIndexSignatures(before);
  const afterIndexSignatures = schemaIndexSignatures(after);
  const signatureCount = Math.max(
    beforeIndexSignatures.length,
    afterIndexSignatures.length,
  );
  for (let index = 0; index < signatureCount; index++) {
    const previous = beforeIndexSignatures[index];
    const current = afterIndexSignatures[index];
    const signaturePath = [...path, 'indexSignatures', String(index)];
    if (previous === undefined) {
      edits.push(edit(signaturePath, undefined, current, side));
      continue;
    }
    if (current === undefined) {
      edits.push(edit(signaturePath, previous, undefined, side));
      continue;
    }
    edits.push(
      ...schemaEdits(previous.parameter, current.parameter, side, [
        ...signaturePath,
        'parameter',
      ]),
      ...schemaEdits(previous.type, current.type, side, [
        ...signaturePath,
        'type',
      ]),
    );
  }
  return edits;
}

function sameEdit(a: SnapshotEdit, b: SnapshotEdit): boolean {
  return (
    stable(a.path) === stable(b.path) &&
    stable(a.before) === stable(b.before) &&
    stable(a.after) === stable(b.after)
  );
}

function combineSchemaSides(
  encoded: readonly SnapshotEdit[],
  decoded: readonly SnapshotEdit[],
): readonly SnapshotEdit[] {
  const remainingDecoded = [...decoded];
  const combined = encoded.map((encodedEdit) => {
    const match = remainingDecoded.findIndex((item) =>
      sameEdit(encodedEdit, item),
    );
    if (match < 0) return encodedEdit;
    remainingDecoded.splice(match, 1);
    return { ...encodedEdit, side: 'encoded-and-decoded' as const };
  });
  return [...combined, ...remainingDecoded];
}

function fieldPath(path: string): readonly string[] {
  const values = path.split('/');
  return values.flatMap((part, index) =>
    values[index - 1] === 'properties'
      ? [part.replaceAll('~1', '/').replaceAll('~0', '~')]
      : [],
  );
}

type NamedPath = {
  readonly path: string;
  readonly name?: string;
  readonly kind?: string;
};

function namedPathEdits(
  before: readonly NamedPath[],
  after: readonly NamedPath[],
  prefix: string,
): readonly SnapshotEdit[] {
  const group = (values: readonly NamedPath[]) => {
    const grouped = new Map<string, string[]>();
    for (const item of values) {
      const names = grouped.get(item.path) ?? [];
      names.push(item.name ?? item.kind ?? '');
      grouped.set(item.path, names);
    }
    return grouped;
  };
  const previous = group(before);
  const current = group(after);
  const paths = new Set([...previous.keys(), ...current.keys()]);
  return [...paths].sort(compareStrings).flatMap((path) => {
    const beforeNames = previous.get(path);
    const afterNames = current.get(path);
    if (stable(beforeNames) === stable(afterNames)) return [];
    const compact = (values: readonly string[] | undefined): unknown =>
      values?.length === 1 ? values[0] : values;
    return [
      edit(
        [prefix, ...fieldPath(path)],
        compact(beforeNames),
        compact(afterNames),
        'contract',
      ),
    ];
  });
}

function versionSubject(identity: string, version: string): SnapshotSubject {
  return { kind: 'version', name: identity, version };
}

function diffVersion(
  identity: string,
  before: ESchemaVersion,
  after: ESchemaVersion,
): readonly SnapshotChange[] {
  const schema = combineSchemaSides(
    schemaEdits(before.encoded, after.encoded, 'encoded'),
    schemaEdits(before.decoded, after.decoded, 'decoded'),
  );
  const transformations = namedPathEdits(
    before.transformations,
    after.transformations,
    'transformation',
  );
  const unverifiable = namedPathEdits(
    before.unverifiable,
    after.unverifiable,
    'unverifiable',
  );
  const subject = versionSubject(identity, after.version);
  return [
    ...(schema.length === 0 && transformations.length === 0
      ? []
      : [
          change(subject, 'edited', 'breaking', [
            ...schema,
            ...transformations,
          ]),
        ]),
    ...(unverifiable.length === 0
      ? []
      : [change(subject, 'edited', 'unverifiable', unverifiable)]),
  ];
}

function definitionEdits(
  before: ESchemaDefinition,
  after: ESchemaDefinition,
): readonly SnapshotEdit[] {
  const previous = before as unknown as Record<string, unknown>;
  const current = after as unknown as Record<string, unknown>;
  return recordEdits(previous, current, ['kind', 'idField']);
}

function diffDefinitions(
  previous: readonly ESchemaDefinition[],
  current: readonly ESchemaDefinition[],
  ignored?: {
    readonly added?: ReadonlySet<string>;
    readonly removed?: ReadonlySet<string>;
  },
): readonly SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  const beforeDefinitions = new Map(
    previous.map((item) => [item.identity, item]),
  );
  const afterDefinitions = new Map(
    current.map((item) => [item.identity, item]),
  );

  for (const definition of current) {
    const before = beforeDefinitions.get(definition.identity);
    if (before === undefined) {
      if (!ignored?.added?.has(definition.identity)) {
        changes.push(
          change(
            { kind: 'eschema', name: definition.identity },
            'added',
            'safe',
          ),
        );
      }
      continue;
    }
    const metadata = definitionEdits(before, definition);
    if (metadata.length > 0) {
      changes.push(
        change(
          { kind: 'eschema', name: definition.identity },
          'edited',
          'breaking',
          metadata,
        ),
      );
    }
    const beforeVersions = new Map(
      before.versions.map((item) => [item.version, item]),
    );
    const afterVersions = new Map(
      definition.versions.map((item) => [item.version, item]),
    );
    for (const [versionIndex, version] of definition.versions.entries()) {
      const prior = beforeVersions.get(version.version);
      if (prior === undefined) {
        changes.push(
          change(
            versionSubject(definition.identity, version.version),
            'added',
            versionIndex >= before.versions.length ? 'safe' : 'breaking',
          ),
        );
      } else {
        changes.push(...diffVersion(definition.identity, prior, version));
      }
    }
    for (const version of before.versions) {
      if (!afterVersions.has(version.version)) {
        changes.push(
          change(
            versionSubject(definition.identity, version.version),
            'removed',
            'breaking',
          ),
        );
      }
    }
  }
  for (const definition of previous) {
    if (
      !afterDefinitions.has(definition.identity) &&
      !ignored?.removed?.has(definition.identity)
    ) {
      changes.push(
        change(
          { kind: 'eschema', name: definition.identity },
          'removed',
          'breaking',
        ),
      );
    }
  }
  return changes;
}

function recordEdits(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): readonly SnapshotEdit[] {
  return fields.flatMap((field) =>
    stable(before[field]) === stable(after[field])
      ? []
      : [edit([field], before[field], after[field], 'contract')],
  );
}

function accessPatternSubject(
  entity: string,
  pattern: TableAccessPatternSnapshot,
): SnapshotSubject {
  return { kind: 'access-pattern', owner: entity, name: pattern.name };
}

function diffEntity(
  before: TableEntitySnapshot,
  after: TableEntitySnapshot,
): readonly SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  const metadata = recordEdits(
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
    ['kind', 'idField', 'schema', 'primary'],
  );
  if (metadata.length > 0) {
    changes.push(
      change(
        { kind: 'entity', name: after.name },
        'edited',
        'breaking',
        metadata,
      ),
    );
  }
  const previous = new Map(
    before.accessPatterns.map((item) => [item.name, item]),
  );
  const current = new Map(
    after.accessPatterns.map((item) => [item.name, item]),
  );
  for (const pattern of after.accessPatterns) {
    const prior = previous.get(pattern.name);
    if (prior === undefined) {
      changes.push(
        change(
          accessPatternSubject(after.name, pattern),
          'added',
          'requires-backfill',
        ),
      );
      continue;
    }
    const edits = recordEdits(
      prior as unknown as Record<string, unknown>,
      pattern as unknown as Record<string, unknown>,
      ['kind', 'index', 'pk', 'sk'],
    );
    if (edits.length > 0) {
      changes.push(
        change(
          accessPatternSubject(after.name, pattern),
          'edited',
          pattern.kind === 'primary' && prior.kind === 'primary'
            ? 'breaking'
            : 'requires-backfill',
          edits,
        ),
      );
    }
  }
  for (const pattern of before.accessPatterns) {
    if (!current.has(pattern.name)) {
      changes.push(
        change(accessPatternSubject(before.name, pattern), 'removed', 'safe'),
      );
    }
  }
  return changes;
}

function indexSubject(
  segment: 'localSecondaryIndexes' | 'globalSecondaryIndexes',
  name: string,
): SnapshotSubject {
  return {
    kind:
      segment === 'localSecondaryIndexes'
        ? 'local-secondary-index'
        : 'global-secondary-index',
    name,
  };
}

function diffSecondaryIndexes(
  segment: 'localSecondaryIndexes' | 'globalSecondaryIndexes',
  previous: readonly TableIndexSnapshot[],
  current: readonly TableIndexSnapshot[],
): readonly SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  const before = new Map(previous.map((item) => [item.name, item]));
  const after = new Map(current.map((item) => [item.name, item]));
  for (const index of current) {
    const prior = before.get(index.name);
    if (prior === undefined) {
      changes.push(
        change(indexSubject(segment, index.name), 'added', 'requires-backfill'),
      );
      continue;
    }
    const edits = recordEdits(
      prior as unknown as Record<string, unknown>,
      index as unknown as Record<string, unknown>,
      ['pk', 'sk'],
    );
    if (edits.length > 0) {
      changes.push(
        change(
          indexSubject(segment, index.name),
          'edited',
          'requires-backfill',
          edits,
        ),
      );
    }
  }
  for (const index of previous) {
    if (!after.has(index.name)) {
      changes.push(
        change(indexSubject(segment, index.name), 'removed', 'safe'),
      );
    }
  }
  return changes;
}

function diffTable(
  previous: TableSnapshot,
  current: TableSnapshot,
): readonly SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  if (previous.logicalName !== current.logicalName) {
    changes.push(
      change(
        { kind: 'table', name: current.logicalName },
        'edited',
        'breaking',
        [edit(['name'], previous.logicalName, current.logicalName, 'contract')],
      ),
    );
  }
  const primary = recordEdits(
    previous.topology.primary as Record<string, unknown>,
    current.topology.primary as Record<string, unknown>,
    ['pk', 'sk'],
  );
  if (primary.length > 0) {
    changes.push(
      change({ kind: 'primary-index' }, 'edited', 'breaking', primary),
    );
  }
  changes.push(
    ...diffSecondaryIndexes(
      'localSecondaryIndexes',
      previous.topology.localSecondaryIndexes,
      current.topology.localSecondaryIndexes,
    ),
    ...diffSecondaryIndexes(
      'globalSecondaryIndexes',
      previous.topology.globalSecondaryIndexes,
      current.topology.globalSecondaryIndexes,
    ),
  );

  const beforeEntities = new Map(
    previous.entities.map((item) => [item.name, item]),
  );
  const afterEntities = new Map(
    current.entities.map((item) => [item.name, item]),
  );
  const addedSchemas = new Set<string>();
  const removedSchemas = new Set<string>();
  for (const entity of current.entities) {
    const prior = beforeEntities.get(entity.name);
    if (prior === undefined) {
      changes.push(
        change({ kind: 'entity', name: entity.name }, 'added', 'safe'),
      );
      addedSchemas.add(entity.schema);
    } else {
      changes.push(...diffEntity(prior, entity));
    }
  }
  for (const entity of previous.entities) {
    if (!afterEntities.has(entity.name)) {
      changes.push(
        change({ kind: 'entity', name: entity.name }, 'removed', 'breaking'),
      );
      removedSchemas.add(entity.schema);
    }
  }
  changes.push(
    ...diffDefinitions(previous.schemas, current.schemas, {
      added: addedSchemas,
      removed: removedSchemas,
    }),
  );
  return changes;
}

function subjectKey(subject: SnapshotSubject): string {
  return [subject.kind, subject.owner, subject.name, subject.version]
    .filter((value): value is string => value !== undefined)
    .join('/');
}

function sortChanges(
  changes: readonly SnapshotChange[],
): readonly SnapshotChange[] {
  return [...changes].sort((a, b) => {
    const subject = compareStrings(
      subjectKey(a.subject),
      subjectKey(b.subject),
    );
    return subject === 0 ? compareStrings(a.impact, b.impact) : subject;
  });
}

function diffESchema(
  previous: ESchemaSnapshot,
  current: ESchemaSnapshot,
): readonly SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  if (previous.root !== current.root) {
    changes.push(
      change({ kind: 'snapshot' }, 'edited', 'breaking', [
        edit(['root'], previous.root, current.root, 'contract'),
      ]),
    );
  }
  changes.push(...diffDefinitions(previous.schemas, current.schemas));
  return changes;
}

function diffSnapshot(
  previous: ContractSnapshot,
  current: ContractSnapshot,
): readonly SnapshotChange[] {
  if (previous.kind === 'table') validateTable(previous);
  if (current.kind === 'table') validateTable(current);
  if (previous.kind !== current.kind) {
    return [
      change({ kind: 'snapshot' }, 'edited', 'unverifiable', [
        edit(['kind'], previous.kind, current.kind, 'contract'),
      ]),
    ];
  }
  return sortChanges(
    previous.kind === 'eschema' && current.kind === 'eschema'
      ? diffESchema(previous, current)
      : previous.kind === 'table' && current.kind === 'table'
        ? diffTable(previous, current)
        : [],
  );
}

export { diffSnapshot };
