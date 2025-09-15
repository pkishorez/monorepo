import type { DynamoTable } from './table.js';

// Core index definitions
export interface SimpleIndexDefinition {
  pk: string;
}

export interface CompoundIndexDefinition {
  pk: string;
  sk: string;
}

export type IndexDefinition = SimpleIndexDefinition | CompoundIndexDefinition;

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

export type KeyTypeFromIndex<T extends IndexDefinition> =
  T extends CompoundIndexDefinition
    ? CompoundIndexDefinition
    : SimpleIndexDefinition;

export type RealKeyFromIndex<T extends IndexDefinition> = T extends {
  pk: infer PK;
  sk: infer SK;
}
  ? { [K in PK as K extends string ? K : never]: string } & {
      [K in SK as K extends string ? K : never]: string;
    }
  : T extends { pk: infer PK }
    ? { [K in PK as K extends string ? K : never]: string }
    : never;

export type ItemWithKeys<
  TPrimary extends IndexDefinition,
  Item extends Record<string, unknown>,
> = RealKeyFromIndex<TPrimary> & Item;

export type ItemWithAllKeys<
  TPrimary extends IndexDefinition,
  TGLSIs extends Record<string, IndexDefinition>,
  Item extends Record<string, unknown>,
> = RealKeyFromIndex<TPrimary> & Item & Partial<AllGLSIKeys<TGLSIs>>;

// Extract all keys from GSIs and LSIs to make them optional
export type AllGLSIKeys<TGLSIs extends Record<string, IndexDefinition>> =
  keyof TGLSIs extends never
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : {
        [K in keyof TGLSIs]: TGLSIs[K] extends IndexDefinition
          ? RealKeyFromIndex<TGLSIs[K]>
          : never;
      }[keyof TGLSIs];

export type ItemForPut<
  TSecondaryIndexes extends Record<string, IndexDefinition>,
  Item = Record<string, unknown>,
> = Partial<AllGLSIKeys<TSecondaryIndexes>> & Item;

export interface DynamoTableType<Table extends DynamoTable<any, any>> {
  primary: Table extends DynamoTable<infer Primary, any> ? Primary : never;
  secondaryIndexes: Table extends DynamoTable<any, infer SecondaryIndexes>
    ? SecondaryIndexes
    : never;
}
