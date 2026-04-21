import type { LoadSubsetOptions } from '@tanstack/react-db';

export type Operators<V> = {
  eq?: V;
  neq?: V;
  gt?: V;
  gte?: V;
  lt?: V;
  lte?: V;
  in?: V[];
  like?: string;
};

export type Filters<T> = {
  [K in keyof T]?: Operators<T[K]>;
};

export type Sort<T> = {
  field: keyof T;
  direction: 'asc' | 'desc';
};

export type ParsedLoadSubsetOptions<T> = {
  filters: Filters<T>;
  sorts: Sort<T>[];
  limit?: number;
  offset?: number;
};

type BasicExpr = {
  type: string;
  name?: string;
  args?: BasicExpr[];
  path?: string[];
  value?: unknown;
};

type OperatorName = keyof Operators<unknown>;

const SUPPORTED_OPS: Set<string> = new Set<OperatorName>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'like',
]);

function extractFilters(
  expr: BasicExpr | undefined,
  filters: Record<string, Record<string, unknown>>,
): void {
  if (!expr) return;

  if (expr.type === 'func' && expr.name === 'and' && expr.args) {
    for (const arg of expr.args) {
      extractFilters(arg, filters);
    }
    return;
  }

  if (
    expr.type === 'func' &&
    expr.name &&
    SUPPORTED_OPS.has(expr.name) &&
    expr.args?.length === 2
  ) {
    const [left, right] = expr.args;
    if (left?.type === 'ref' && left.path && right?.type === 'val') {
      const field = left.path[left.path.length - 1]!;
      if (!filters[field]) filters[field] = {};
      filters[field][expr.name] = right.value;
    }
  }
}

export const parseLoadSubsetOptions = <T>(
  options: LoadSubsetOptions,
): ParsedLoadSubsetOptions<T> => {
  const filters: Record<string, Record<string, unknown>> = {};
  extractFilters(options.where as BasicExpr | undefined, filters);

  const sorts: Sort<T>[] = [];
  if (options.orderBy) {
    for (const clause of options.orderBy) {
      const expr = clause.expression as BasicExpr;
      if (expr?.type === 'ref' && expr.path) {
        sorts.push({
          field: expr.path[expr.path.length - 1] as keyof T,
          direction: clause.compareOptions.direction,
        });
      }
    }
  }

  return {
    filters: filters as Filters<T>,
    sorts,
    ...(options.limit !== undefined && { limit: options.limit }),
    ...(options.offset !== undefined && { offset: options.offset }),
  };
};
