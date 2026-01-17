export type SortKeyparameter<Type = string> =
  | { '<': Type }
  | { '<=': Type }
  | { '>': Type }
  | { '>=': Type };

export type IndexDefinition = {
  pk: Lowercase<string>;
  sk: Lowercase<string>;
};
