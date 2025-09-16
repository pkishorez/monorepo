import type { DynamoTable } from './table.js';

export interface CompoundIndexDefinition {
  pk: string;
  sk: string;
}

export type IndexDefinition = CompoundIndexDefinition;

export type SecondaryIndexDefinition = IndexDefinition;

// Utility type to simplify complex type intersections
export type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};

export interface DynamoConfig {
  region?: string;
  accessKey: string;
  secretKey: string;
  endpoint?: string;
}

export type RealKeyFromIndex<T extends IndexDefinition> = T extends {
  pk: infer PK extends string;
  sk: infer SK extends string;
}
  ? Record<PK | SK, string>
  : never;

export type ItemWithPrimaryIndex<
  TPrimary extends IndexDefinition,
  Item,
> = RealKeyFromIndex<TPrimary> & Item;

export type ItemWithAllKeys<
  TPrimary extends IndexDefinition,
  TGLSIs extends Record<string, IndexDefinition>,
  Item extends Record<string, unknown>,
> = RealKeyFromIndex<TPrimary> & Item & Partial<AllGLSIKeys<TGLSIs>>;

type IfNever<T, Default> = [T] extends [never] ? Default : T;
// Extract all keys from GSIs and LSIs.
export type AllGLSIKeys<TGLSIs extends Record<string, IndexDefinition>> =
  Simplify<
    IfNever<
      {
        [K in keyof TGLSIs]: RealKeyFromIndex<TGLSIs[K]>;
      }[keyof TGLSIs],
      // eslint-disable-next-line ts/no-empty-object-type
      {}
    >
  >;

export type ItemForPut<
  TSecondaryIndexes extends Record<string, IndexDefinition>,
  Item = Record<string, unknown>,
> = Partial<AllGLSIKeys<TSecondaryIndexes>> & Item;

export interface DynamoTableType<Table extends DynamoTable<any, any, any>> {
  primary: Table extends DynamoTable<infer Primary, any, any> ? Primary : never;
  secondaryIndexes: Table extends DynamoTable<any, infer SecondaryIndexes, any>
    ? SecondaryIndexes
    : never;
}
