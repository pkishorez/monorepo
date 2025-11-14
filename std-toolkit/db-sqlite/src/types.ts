export type SortKeyparameter<Type = string> =
  | { '<': Type }
  | { '<=': Type }
  | { '>': Type }
  | { '>=': Type };
