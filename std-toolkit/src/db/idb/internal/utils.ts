type Operator = '<' | '<=' | '>' | '>=';

export type SkParam =
  | { '<': string | null }
  | { '<=': string | null }
  | { '>': string | null }
  | { '>=': string | null };

export type StreamSkParam = { '>': string | null } | { '<': string | null };

export interface SimpleQueryOptions {
  limit?: number;
}

export interface QueryStreamOptions {
  batchSize?: number;
}

export interface SubscribeOptions<K, PK> {
  key: K;
  pk: PK;
  cursor: string | null;
  limit?: number;
}

/**
 * Derives an index key value from field dependencies and a value object.
 */
export const deriveIndexKeyValue = (
  prefix: string,
  deps: string[],
  value: Record<string, unknown>,
  isPk: boolean,
): string => {
  if (deps.length === 0) {
    return prefix;
  }

  const values = deps.map((dep) => String(value[dep] ?? ''));

  if (isPk) {
    return `${prefix}#${values.join('#')}`;
  }

  return values.join('#');
};

export const extractKeyOp = (
  op: SkParam,
): { operator: Operator; value: string | null } => {
  if ('<' in op) return { operator: '<', value: op['<'] };
  if ('<=' in op) return { operator: '<=', value: op['<='] };
  if ('>' in op) return { operator: '>', value: op['>'] };
  if ('>=' in op) return { operator: '>=', value: op['>='] };
  throw new Error('Invalid KeyOp: no valid operator found');
};

export const getKeyOpScanDirection = (operator: Operator): boolean =>
  operator === '>' || operator === '>=';

/**
 * Stored derivation info for a secondary index.
 */
export interface StoredIndexDerivation {
  indexName: string;
  entityIndexName: string;
  pkDeps: string[];
  skDeps: string[];
  isTimelineSk: boolean;
}

/**
 * Sort key parameter for custom-SK indexes.
 *
 * @typeParam T - The entity type
 * @typeParam SkKeys - Tuple of SK field names
 */
export type CustomSkParam<T, SkKeys extends readonly (keyof T)[]> =
  | { '<': Pick<T, SkKeys[number]> | null }
  | { '<=': Pick<T, SkKeys[number]> | null }
  | { '>': Pick<T, SkKeys[number]> | null }
  | { '>=': Pick<T, SkKeys[number]> | null };

/**
 * Stream SK param for custom-SK indexes (exclusive operators only).
 */
export type CustomStreamSkParam<T, SkKeys extends readonly (keyof T)[]> =
  | { '>': Pick<T, SkKeys[number]> | null }
  | { '<': Pick<T, SkKeys[number]> | null };

/**
 * Internal derivation info for the primary index.
 */
export interface StoredPrimaryDerivation {
  pkDeps: string[];
  skDeps: string[];
}
