import type { SnapshotCheck, SnapshotType } from '../../../eschema/index.js';
import type {
  ESchemaDefinition,
  ESchemaVersion,
  SnapshotChange,
  TableAccessPatternSnapshot,
  TableBackfillSnapshot,
  TableEntitySnapshot,
  TableIndexSnapshot,
  TableSnapshot,
} from '../../domain/index.js';
import { compareStrings } from '../../domain/index.js';
import { validateTableSnapshot } from '../snapshot-decoder/index.js';

type SnapshotEdit = SnapshotChange['edits'][number];
type SnapshotSubject = SnapshotChange['subject'];

const stable = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

function edit(
  path: readonly string[],
  before: unknown,
  after: unknown,
): SnapshotEdit {
  return {
    path: [...path],
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  };
}

function change(
  subject: SnapshotSubject,
  action: SnapshotChange['action'],
  impact: SnapshotChange['impact'],
  edits: readonly SnapshotEdit[] = [],
  description?: string,
): SnapshotChange {
  return {
    subject,
    action,
    impact,
    edits: [...edits],
    ...(description === undefined ? {} : { description }),
  };
}

/**
 * A shape with its display metadata removed. Checks never change what is
 * stored, so comparison never sees them; entity references are kept only
 * when `keepReferences` is set, so a retargeted reference can be reported as
 * the safe visualization change it is.
 */
function contractOf(
  shape: SnapshotType,
  keepReferences: boolean,
): SnapshotType {
  const reference =
    keepReferences &&
    'entityReference' in shape &&
    shape.entityReference !== undefined
      ? { entityReference: shape.entityReference }
      : {};
  const nested = (child: SnapshotType) => contractOf(child, keepReferences);
  switch (shape.type) {
    case 'struct':
      return {
        type: 'struct',
        fields: shape.fields.map((field) => ({
          ...field,
          type: nested(field.type),
        })),
        ...reference,
      };
    case 'array':
      return { type: 'array', element: nested(shape.element), ...reference };
    case 'record':
      return { type: 'record', value: nested(shape.value), ...reference };
    case 'union':
      return {
        type: 'union',
        members: shape.members.map(nested),
        ...reference,
      };
    case 'recursive':
      return { type: 'recursive', body: nested(shape.body) };
    case 'literal':
      return { type: 'literal', value: shape.value, ...reference };
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'unknown':
      return { type: shape.type, ...reference };
    default:
      return shape;
  }
}

/** Field-level edits between two check-free shapes; any other difference is one edit. */
function shapeEdits(
  before: SnapshotType,
  after: SnapshotType,
  path: readonly string[] = [],
): readonly SnapshotEdit[] {
  if (stable(before) === stable(after)) return [];
  if (before.type !== 'struct' || after.type !== 'struct') {
    return [edit(path, before, after)];
  }
  const previous = new Map(before.fields.map((field) => [field.name, field]));
  const current = new Map(after.fields.map((field) => [field.name, field]));
  const names = [...new Set([...previous.keys(), ...current.keys()])].sort(
    compareStrings,
  );
  return names.flatMap((name): readonly SnapshotEdit[] => {
    const prior = previous.get(name);
    const next = current.get(name);
    const fieldPath = [...path, name];
    if (prior === undefined) return [edit(fieldPath, undefined, next!.type)];
    if (next === undefined) return [edit(fieldPath, prior.type, undefined)];
    const presence =
      (prior.optional ?? false) === (next.optional ?? false)
        ? []
        : [
            edit(
              [...fieldPath, 'presence'],
              prior.optional ? 'optional' : 'required',
              next.optional ? 'optional' : 'required',
            ),
          ];
    return [...presence, ...shapeEdits(prior.type, next.type, fieldPath)];
  });
}

type Bound = { readonly value: number; readonly exclusive: boolean };

/** Whether a lower bound accepts at least what `before` accepted. */
const lowerLoosens = (before: Bound, after: Bound) =>
  after.value < before.value ||
  (after.value === before.value && (!after.exclusive || before.exclusive));

/** Whether an upper bound accepts at least what `before` accepted. */
const upperLoosens = (before: Bound, after: Bound) =>
  after.value > before.value ||
  (after.value === before.value && (!after.exclusive || before.exclusive));

const inclusive = (value: number): Bound => ({ value, exclusive: false });
const exclusive = (value: number): Bound => ({ value, exclusive: true });

/**
 * Whether `after` accepts every value `before` did, for one check kind. Only
 * bounds can loosen; any other check must stay exactly as it was.
 */
function loosens(before: SnapshotCheck, after: SnapshotCheck): boolean {
  switch (before.check) {
    case 'minLength':
      return after.check === 'minLength' && after.minLength <= before.minLength;
    case 'maxLength':
      return after.check === 'maxLength' && after.maxLength >= before.maxLength;
    case 'lengthBetween':
      return (
        after.check === 'lengthBetween' &&
        after.minimum <= before.minimum &&
        after.maximum >= before.maximum
      );
    case 'greaterThan':
    case 'greaterThanOrEqualTo': {
      const prior =
        before.check === 'greaterThan'
          ? exclusive(before.exclusiveMinimum)
          : inclusive(before.minimum);
      if (after.check === 'greaterThan')
        return lowerLoosens(prior, exclusive(after.exclusiveMinimum));
      if (after.check === 'greaterThanOrEqualTo')
        return lowerLoosens(prior, inclusive(after.minimum));
      return false;
    }
    case 'lessThan':
    case 'lessThanOrEqualTo': {
      const prior =
        before.check === 'lessThan'
          ? exclusive(before.exclusiveMaximum)
          : inclusive(before.maximum);
      if (after.check === 'lessThan')
        return upperLoosens(prior, exclusive(after.exclusiveMaximum));
      if (after.check === 'lessThanOrEqualTo')
        return upperLoosens(prior, inclusive(after.maximum));
      return false;
    }
    case 'between':
      return (
        after.check === 'between' &&
        lowerLoosens(
          {
            value: before.minimum,
            exclusive: before.exclusiveMinimum ?? false,
          },
          { value: after.minimum, exclusive: after.exclusiveMinimum ?? false },
        ) &&
        upperLoosens(
          {
            value: before.maximum,
            exclusive: before.exclusiveMaximum ?? false,
          },
          { value: after.maximum, exclusive: after.exclusiveMaximum ?? false },
        )
      );
    default:
      return false;
  }
}

interface CheckEdit {
  readonly edit: SnapshotEdit;
  readonly impact: 'safe' | 'breaking';
}

/**
 * Check changes between two versions of one shape whose stored structure is
 * the same. A stored row was accepted by the old checks, so a check may be
 * removed or loosened but never added or tightened: a row that fails it no
 * longer reads. Adding `finite` to a number is the exception, since JSON
 * cannot have stored a non-finite one in a form that reads back.
 */
function checkEdits(
  before: SnapshotType,
  after: SnapshotType,
  path: readonly string[] = [],
): readonly CheckEdit[] {
  const prior = ('checks' in before ? before.checks : undefined) ?? [];
  const next = ('checks' in after ? after.checks : undefined) ?? [];
  const same = (a: SnapshotCheck) => (b: SnapshotCheck) =>
    stable(a) === stable(b);
  const removed = prior.filter((check) => !next.some(same(check)));
  const added = next.filter((check) => !prior.some(same(check)));
  const tightened = added.filter(
    (check) =>
      !(check.check === 'finite' && after.type === 'number') &&
      !removed.some((old) => loosens(old, check)),
  );
  const own: CheckEdit[] =
    removed.length === 0 && added.length === 0
      ? []
      : [
          {
            edit: edit([...path, 'checks'], prior, next),
            impact: tightened.length > 0 ? 'breaking' : 'safe',
          },
        ];
  const nested = (): readonly CheckEdit[] => {
    if (before.type === 'struct' && after.type === 'struct') {
      const fields = new Map(after.fields.map((field) => [field.name, field]));
      return before.fields.flatMap((field) => {
        const match = fields.get(field.name);
        return match === undefined
          ? []
          : checkEdits(field.type, match.type, [...path, field.name]);
      });
    }
    if (before.type === 'array' && after.type === 'array')
      return checkEdits(before.element, after.element, [...path, '[]']);
    if (before.type === 'record' && after.type === 'record')
      return checkEdits(before.value, after.value, [...path, '{}']);
    if (before.type === 'recursive' && after.type === 'recursive')
      return checkEdits(before.body, after.body, path);
    if (before.type === 'union' && after.type === 'union') {
      // A branch that is unchanged, checks included, may have moved; only the
      // branches left over are compared in order.
      const unmatched = [...after.members.keys()];
      const pending = before.members.flatMap((member, index) => {
        const same = unmatched.findIndex(
          (other) => stable(after.members[other]) === stable(member),
        );
        if (same === -1) return [index];
        unmatched.splice(same, 1);
        return [];
      });
      return pending.flatMap((index, position) => {
        const other = unmatched[position];
        return other === undefined
          ? []
          : checkEdits(before.members[index]!, after.members[other]!, [
              ...path,
              String(index),
            ]);
      });
    }
    return [];
  };
  return [...own, ...nested()];
}

function versionSubject(identity: string, version: string): SnapshotSubject {
  return { kind: 'version', name: identity, version };
}

function diffVersion(
  identity: string,
  before: ESchemaVersion,
  after: ESchemaVersion,
): readonly SnapshotChange[] {
  const subject = versionSubject(identity, after.version);
  // Making a shipped version a gap strands its rows; making a gap migrate
  // changes how rows written before it read.
  const gap =
    before.gap === after.gap ? [] : [edit(['gap'], before.gap, after.gap)];
  const edits = [
    ...gap,
    ...shapeEdits(
      contractOf(before.shape, false),
      contractOf(after.shape, false),
    ),
  ];
  if (edits.length > 0) return [change(subject, 'edited', 'breaking', edits)];
  const references = shapeEdits(
    contractOf(before.shape, true),
    contractOf(after.shape, true),
  );
  const checks = checkEdits(before.shape, after.shape);
  const tightened = checks
    .filter(({ impact }) => impact === 'breaking')
    .map(({ edit }) => edit);
  const loosened = checks
    .filter(({ impact }) => impact === 'safe')
    .map(({ edit }) => edit);
  return [
    ...(tightened.length === 0
      ? []
      : [change(subject, 'edited', 'breaking', tightened)]),
    ...(references.length + loosened.length === 0
      ? []
      : [change(subject, 'edited', 'safe', [...references, ...loosened])]),
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
        const appended = versionIndex >= before.versions.length;
        changes.push(
          appended && version.gap
            ? change(
                versionSubject(definition.identity, version.version),
                'added',
                'requires-backfill',
                [],
                `${definition.identity} ${version.version} is a gap version: rows stored before it read only after a Backfill fills it`,
              )
            : change(
                versionSubject(definition.identity, version.version),
                'added',
                appended ? 'safe' : 'breaking',
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
      : [edit([field], before[field], after[field])],
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

function backfillSubject(id: string): SnapshotSubject {
  return { kind: 'backfill', name: id };
}

/**
 * A Backfill is never removed once shipped, and what it fills never changes:
 * a table part-way through it would be left with no step to finish. Its
 * `after` only orders it among pending Backfills, so changing that is safe.
 */
function diffBackfills(
  previous: readonly TableBackfillSnapshot[],
  current: readonly TableBackfillSnapshot[],
): readonly SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  const before = new Map(previous.map((item) => [item.id, item]));
  const after = new Map(current.map((item) => [item.id, item]));
  for (const backfill of current) {
    const prior = before.get(backfill.id);
    if (prior === undefined) {
      changes.push(change(backfillSubject(backfill.id), 'added', 'safe'));
      continue;
    }
    const contract = recordEdits(
      prior as unknown as Record<string, unknown>,
      backfill as unknown as Record<string, unknown>,
      ['kind', 'entity', 'to'],
    );
    if (contract.length > 0)
      changes.push(
        change(backfillSubject(backfill.id), 'edited', 'breaking', contract),
      );
    const order = recordEdits(
      prior as unknown as Record<string, unknown>,
      backfill as unknown as Record<string, unknown>,
      ['after'],
    );
    if (order.length > 0)
      changes.push(
        change(backfillSubject(backfill.id), 'edited', 'safe', order),
      );
  }
  for (const backfill of previous)
    if (!after.has(backfill.id))
      changes.push(
        change(
          backfillSubject(backfill.id),
          'removed',
          'breaking',
          [],
          `A shipped Backfill is never removed: a table it has not finished on could not read the rows it was filling`,
        ),
      );
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
        [edit(['name'], previous.logicalName, current.logicalName)],
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
    ...diffBackfills(previous.backfills, current.backfills),
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

function diffTableSnapshot(
  previous: TableSnapshot,
  current: TableSnapshot,
): readonly SnapshotChange[] {
  validateTableSnapshot(previous);
  validateTableSnapshot(current);
  return sortChanges(diffTable(previous, current));
}

export { diffTableSnapshot };
