import type { Effect } from 'effect';
import type { StudioRpcClient } from 'std-toolkit/studio-rpc';
import type { SnapshotType } from 'std-toolkit/eschema';
import type { TableSnapshot } from 'std-toolkit/snapshot';

type TableEntitySnapshot = TableSnapshot['entities'][number];
type TableAccessPatternSnapshot = TableEntitySnapshot['accessPatterns'][number];
type GetEntityResult = Effect.Success<
  ReturnType<StudioRpcClient['Studio.GetEntity']>
>;
type QueryEntitiesResult = Effect.Success<
  ReturnType<StudioRpcClient['Studio.QueryEntities']>
>;

export type StudioRecord = NonNullable<GetEntityResult>;
export type StudioQueryRecord = QueryEntitiesResult['items'][number];
type QueryPayload = Parameters<StudioRpcClient['Studio.QueryEntities']>[0];

export type QueryOperator =
  | 'all'
  | '='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'between'
  | 'beginsWith';

export type KeyKind = 'string' | 'number';

type KeyValues = Readonly<Record<string, string | number>>;

export type QueryCriteria = {
  readonly entity: TableEntitySnapshot;
  readonly pattern: TableAccessPatternSnapshot;
  readonly kinds: Readonly<Record<string, KeyKind>>;
  readonly pk: Readonly<Record<string, string>>;
  readonly operator: QueryOperator;
  readonly sk: Readonly<Record<string, string>>;
  readonly skEnd: Readonly<Record<string, string>>;
  readonly unbounded: boolean;
  readonly limit: number;
};

const valueRecord = (
  keys: readonly string[],
): Readonly<Record<string, string>> =>
  Object.fromEntries(keys.map((key) => [key, '']));

const latestShape = (
  snapshot: TableSnapshot,
  identity: string,
): SnapshotType | undefined =>
  snapshot.schemas
    .find((definition) => definition.identity === identity)
    ?.versions.at(-1)?.shape;

const valueFields = (
  snapshot: TableSnapshot,
  entity: TableEntitySnapshot,
): readonly string[] => {
  const shape = latestShape(snapshot, entity.schema);
  return shape?.type === 'struct' ? shape.fields.map(({ name }) => name) : [];
};

// Unions, recursion and nested ESchemas are transparent to a key path.
const expand = (
  snapshot: TableSnapshot,
  shape: SnapshotType,
): SnapshotType[] => {
  switch (shape.type) {
    case 'union':
      return shape.members.flatMap((member) => expand(snapshot, member));
    case 'recursive':
      return expand(snapshot, shape.body);
    case 'ref': {
      const root = latestShape(snapshot, shape.identity);
      return root === undefined ? [] : expand(snapshot, root);
    }
    default:
      return [shape];
  }
};

const property = (
  snapshot: TableSnapshot,
  shapes: readonly SnapshotType[],
  name: string,
): SnapshotType[] =>
  shapes.flatMap((current) =>
    expand(snapshot, current).flatMap((shape) =>
      shape.type === 'struct'
        ? shape.fields
            .filter((field) => field.name === name)
            .map(({ type }) => type)
        : [],
    ),
  );

const isNumberLeaf = (shape: SnapshotType): boolean =>
  shape.type === 'number' ||
  (shape.type === 'literal' && typeof shape.value === 'number');

const keyKind = (
  snapshot: TableSnapshot,
  entity: TableEntitySnapshot,
  path: string,
): KeyKind => {
  const root = latestShape(snapshot, entity.schema);
  if (path === '_u' || root === undefined) return 'string';
  const leaves = path
    .split('.')
    .reduce<SnapshotType[]>(
      (shapes, name) => property(snapshot, shapes, name),
      [root],
    )
    .flatMap((leaf) => expand(snapshot, leaf))
    .filter((shape) => shape.type !== 'null');
  return leaves.length > 0 && leaves.every(isNumberLeaf) ? 'number' : 'string';
};

const parseNumber = (value: string): number | undefined => {
  const parsed = Number(value.trim());
  return value.trim() === '' || !Number.isFinite(parsed) ? undefined : parsed;
};

const keyIssue = (kind: KeyKind, value: string): string | undefined =>
  kind === 'number' && value.trim() !== '' && parseNumber(value) === undefined
    ? 'Must be a number'
    : undefined;

const complete = (
  criteria: QueryCriteria,
  keys: readonly string[],
  values: Readonly<Record<string, string>>,
) =>
  keys.every((key) => {
    const value = values[key] ?? '';
    return (
      value.trim() !== '' &&
      keyIssue(criteria.kinds[key] ?? 'string', value) === undefined
    );
  });

const keyValues = (
  criteria: QueryCriteria,
  values: Readonly<Record<string, string>>,
): KeyValues =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      criteria.kinds[key] === 'number' ? (parseNumber(value) ?? value) : value,
    ]),
  );

const canBeUnbounded = (operator: QueryOperator) =>
  operator === '<' ||
  operator === '<=' ||
  operator === '>' ||
  operator === '>=';

const canRun = (criteria: QueryCriteria): boolean => {
  if (!complete(criteria, criteria.pattern.pk, criteria.pk)) return false;
  if (criteria.operator === 'all') return true;
  if (criteria.unbounded && canBeUnbounded(criteria.operator)) return true;
  if (!complete(criteria, criteria.pattern.sk, criteria.sk)) return false;
  return (
    criteria.operator !== 'between' ||
    complete(criteria, criteria.pattern.sk, criteria.skEnd)
  );
};

const payload = (
  criteria: QueryCriteria,
  after?: StudioQueryRecord,
): QueryPayload | undefined => {
  if (!canRun(criteria)) return undefined;
  const sk = keyValues(criteria, criteria.sk);
  const base = {
    entity: criteria.entity.name,
    accessPattern: criteria.pattern.name,
    pk: keyValues(criteria, criteria.pk),
    limit: criteria.limit,
    ...(after === undefined ? {} : { after }),
  };
  if (criteria.operator === 'all') return base;
  if (criteria.operator === 'between') {
    return {
      ...base,
      sk: {
        operator: criteria.operator,
        value: [sk, keyValues(criteria, criteria.skEnd)] as const,
      },
    };
  }
  if (criteria.operator === '=' || criteria.operator === 'beginsWith') {
    return {
      ...base,
      sk: { operator: criteria.operator, value: sk },
    };
  }
  return {
    ...base,
    sk: {
      operator: criteria.operator,
      value:
        criteria.unbounded && canBeUnbounded(criteria.operator) ? null : sk,
    },
  };
};

const isQueryRecord = (record: StudioRecord): record is StudioQueryRecord =>
  '_d' in record.meta;

const initialCriteria = (
  snapshot: TableSnapshot,
  entity: TableEntitySnapshot,
  pattern: TableAccessPatternSnapshot,
  limit = 25,
): QueryCriteria => ({
  entity,
  pattern,
  kinds: Object.fromEntries(
    [...pattern.pk, ...pattern.sk].map((path) => [
      path,
      keyKind(snapshot, entity, path),
    ]),
  ),
  pk: valueRecord(pattern.pk),
  operator: 'all',
  sk: valueRecord(pattern.sk),
  skEnd: valueRecord(pattern.sk),
  unbounded: false,
  limit,
});

const patternLabel = (pattern: TableAccessPatternSnapshot): string => {
  if (pattern.kind === 'primary') return `${pattern.name} · Primary`;
  return `${pattern.name} · ${pattern.index ?? pattern.kind.toUpperCase()}`;
};

const updateValue = (
  values: Readonly<Record<string, string>>,
  key: string,
  value: string,
): Readonly<Record<string, string>> => ({ ...values, [key]: value });

export const QueryModel = {
  canBeUnbounded,
  canRun,
  initialCriteria,
  isQueryRecord,
  keyIssue,
  patternLabel,
  payload,
  updateValue,
  valueFields,
};
