import type { CompoundIndexDefinition, IndexDefinition } from '../../types.js';

export type KeyConditionExprParameters<Index extends IndexDefinition> =
  Index extends CompoundIndexDefinition
    ? {
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
    : never;
