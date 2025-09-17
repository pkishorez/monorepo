export interface KeyConditionExprParameters {
  pk: string;
  sk?:
    | undefined
    | string
    | { beginsWith: string }
    | { between: [string, string] }
    | { '<': string }
    | { '<=': string }
    | { '>': string }
    | { '>=': string };
}
