import type { Effect } from 'effect';
import type { StudioRpcClient } from 'std-toolkit/studio-rpc';
import type {
  TableAccessPatternSnapshot,
  TableEntitySnapshot,
  TableSnapshot,
} from 'std-toolkit/snapshot';

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

export type QueryCriteria = {
  readonly entity: TableEntitySnapshot;
  readonly pattern: TableAccessPatternSnapshot;
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
  const encoded = definition?.versions.at(-1)?.encoded;
  const representation = objectRepresentation(encoded);
  const properties = Array.isArray(representation?.propertySignatures)
    ? representation.propertySignatures
    : [];
  return properties.flatMap((property) => {
    if (!isRecord(property)) return [];
    const name = propertyName(property);
    return name === undefined || name === '_v' ? [] : [name];
  });
};

const complete = (
  keys: readonly string[],
  values: Readonly<Record<string, string>>,
) => keys.every((key) => values[key]?.trim() !== '');

const canBeUnbounded = (operator: QueryOperator) =>
  operator === '<' ||
  operator === '<=' ||
  operator === '>' ||
  operator === '>=';

const canRun = (criteria: QueryCriteria): boolean => {
  if (!complete(criteria.pattern.pk, criteria.pk)) return false;
  if (criteria.operator === 'all') return true;
  if (criteria.unbounded && canBeUnbounded(criteria.operator)) return true;
  if (!complete(criteria.pattern.sk, criteria.sk)) return false;
  return (
    criteria.operator !== 'between' ||
    complete(criteria.pattern.sk, criteria.skEnd)
  );
};

const payload = (
  criteria: QueryCriteria,
  after?: StudioQueryRecord,
): QueryPayload | undefined => {
  if (!canRun(criteria)) return undefined;
  const base = {
    entity: criteria.entity.name,
    accessPattern: criteria.pattern.name,
    pk: criteria.pk,
    limit: criteria.limit,
    ...(after === undefined ? {} : { after }),
  };
  if (criteria.operator === 'all') return base;
  if (criteria.operator === 'between') {
    return {
      ...base,
      sk: {
        operator: criteria.operator,
        value: [criteria.sk, criteria.skEnd] as const,
      },
    };
  }
  if (criteria.operator === '=' || criteria.operator === 'beginsWith') {
    return {
      ...base,
      sk: { operator: criteria.operator, value: criteria.sk },
    };
  }
  return {
    ...base,
    sk: {
      operator: criteria.operator,
      value:
        criteria.unbounded && canBeUnbounded(criteria.operator)
          ? null
          : criteria.sk,
    },
  };
};

const isQueryRecord = (record: StudioRecord): record is StudioQueryRecord =>
  '_d' in record.meta;

const initialCriteria = (
  entity: TableEntitySnapshot,
  pattern: TableAccessPatternSnapshot,
  limit = 25,
): QueryCriteria => ({
  entity,
  pattern,
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
  patternLabel,
  payload,
  updateValue,
  valueFields,
};
