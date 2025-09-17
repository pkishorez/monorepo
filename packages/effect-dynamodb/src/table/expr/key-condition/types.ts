export interface KeyConditionExprParameters {
  pk: string;
  sk?:
    | string
    | { beginsWith: string }
    | { between: [string, string] }
    | { '<': string }
    | { '<=': string }
    | { '>': string }
    | { '>=': string };
}
