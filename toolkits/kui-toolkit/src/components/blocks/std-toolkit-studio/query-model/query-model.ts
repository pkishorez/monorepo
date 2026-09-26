import type { Effect } from 'effect';
import type { StudioRpcClient } from 'std-toolkit/studio-rpc';
import type { TableSnapshot } from 'std-toolkit/snapshot';

type TableEntitySnapshot = TableSnapshot['entities'][number];
type TableAccessPatternSnapshot = TableEntitySnapshot['accessPatterns'][number];
type JsonRecord = Readonly<Record<string, unknown>>;
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

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const persistedValue = (value: unknown): unknown =>
  isRecord(value) && 'type' in value && 'value' in value ? value.value : value;

const valueRecord = (
  keys: readonly string[],
): Readonly<Record<string, string>> =>
  Object.fromEntries(keys.map((key) => [key, '']));

const objectRepresentation = (value: unknown): JsonRecord | undefined => {
  if (!isRecord(value)) return undefined;
  const representation =
    'representation' in value ? value.representation : value;
  return isRecord(representation) && representation._tag === 'Objects'
    ? representation
    : undefined;
};

const propertyName = (property: JsonRecord): string | undefined => {
  const name = persistedValue(property.name);
  return typeof name === 'string' ? name : undefined;
};

const valueFields = (
  snapshot: TableSnapshot,
  entity: TableEntitySnapshot,
): readonly string[] => {
  const definition = snapshot.schemas.find(
    ({ identity }) => identity === entity.schema,
  );
  const representation = objectRepresentation(
    definition?.versions.at(-1)?.serialized,
  );
  const properties = Array.isArray(representation?.propertySignatures)
    ? representation.propertySignatures
    : [];
  return properties.flatMap((property) => {
    if (!isRecord(property)) return [];
    const name = propertyName(property);
    return name === undefined || name === '_v' ? [] : [name];
  });
};

type Node = { readonly node: unknown; readonly references: JsonRecord };

const latestRoot = (
  snapshot: TableSnapshot,
  identity: string,
): Node | undefined => {
  const serialized = snapshot.schemas
    .find((definition) => definition.identity === identity)
    ?.versions.at(-1)?.serialized;
  if (!isRecord(serialized)) return undefined;
  return {
    node: serialized.representation,
    references: isRecord(serialized.references) ? serialized.references : {},
  };
};

// Unions, references and nested ESchemas are transparent to a key path.
const expand = (
  snapshot: TableSnapshot,
  { node, references }: Node,
): Node[] => {
  if (!isRecord(node)) return [];
  if (node._tag === 'Union' && Array.isArray(node.types)) {
    return node.types.flatMap((type) =>
      expand(snapshot, { node: type, references }),
    );
  }
  if (node._tag === 'Reference' && typeof node.$ref === 'string') {
    return expand(snapshot, { node: references[node.$ref], references });
  }
  if (node._tag === 'Suspend') {
    return expand(snapshot, { node: node.thunk, references });
  }
  if (node._tag === 'ESchemaRef' && typeof node.identity === 'string') {
    const root = latestRoot(snapshot, node.identity);
    return root === undefined ? [] : expand(snapshot, root);
  }
  return [{ node, references }];
};

const property = (
  snapshot: TableSnapshot,
  nodes: readonly Node[],
  name: string,
): Node[] =>
  nodes.flatMap((current) =>
    expand(snapshot, current).flatMap(({ node, references }) => {
      if (!isRecord(node) || node._tag !== 'Objects') return [];
      const properties = Array.isArray(node.propertySignatures)
        ? node.propertySignatures
        : [];
      return properties.flatMap((candidate) =>
        isRecord(candidate) && propertyName(candidate) === name
          ? [{ node: candidate.type, references }]
          : [],
      );
    }),
  );

const isNumberLeaf = (node: unknown): boolean => {
  if (!isRecord(node)) return false;
  if (node._tag === 'Number') return true;
  if (node._tag === 'Literal') {
    return typeof persistedValue(node.literal) === 'number';
  }
  return (
    node._tag === 'Enum' &&
    Array.isArray(node.enums) &&
    node.enums.every(
      (member) =>
        Array.isArray(member) && typeof persistedValue(member[1]) === 'number',
    )
  );
};

const keyKind = (
  snapshot: TableSnapshot,
  entity: TableEntitySnapshot,
  path: string,
): KeyKind => {
  const root = latestRoot(snapshot, entity.schema);
  if (path === '_u' || root === undefined) return 'string';
  const leaves = path
    .split('.')
    .reduce<Node[]>((nodes, name) => property(snapshot, nodes, name), [root])
    .flatMap((leaf) => expand(snapshot, leaf))
    .map(({ node }) => node)
    .filter((node) => !isRecord(node) || node._tag !== 'Null');
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
