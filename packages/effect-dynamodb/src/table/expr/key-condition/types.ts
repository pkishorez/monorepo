export interface KeyConditionExprParameters<T = string> {
  pk: string;
  sk?: undefined | string | SortKeyparameter<T> | null;
}

export type SortKeyparameter<Type = string> =
  | { beginsWith: Type }
  | { between: [Type, Type] }
  | { '<': Type }
  | { '<=': Type }
  | { '>': Type }
  | { '>=': Type };
