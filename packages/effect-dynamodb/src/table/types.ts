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

export type KeyFromIndex<T extends IndexDefinition> = T extends {
  sk: infer SK;
  pk: infer PK;
}
  ? { [K in PK as K extends string ? K : never]: string } & {
      [K in SK as K extends string ? K : never]: string;
    }
  : T extends { pk: infer PK }
    ? { [K in PK as K extends string ? K : never]: string }
    : never;

export type ItemWithKeys<TPrimary extends IndexDefinition> =
  KeyFromIndex<TPrimary> & Record<string, unknown>;

// Extract all keys from GSIs and LSIs to make them optional
export type AllGLSIKeys<TGLSIs extends Record<string, IndexDefinition>> =
  keyof TGLSIs extends never
    ? // eslint-disable-next-line ts/no-empty-object-type
      {}
    : {
        [K in keyof TGLSIs]: TGLSIs[K] extends IndexDefinition
          ? KeyFromIndex<TGLSIs[K]>
          : never;
      }[keyof TGLSIs];

export type ItemForPut<
  TPrimary extends IndexDefinition,
  TGSIs extends Record<string, IndexDefinition>,
  TLSIs extends Record<string, IndexDefinition>,
  Item = Record<string, unknown>,
> = KeyFromIndex<TPrimary> &
  Partial<AllGLSIKeys<TGSIs>> &
  Partial<AllGLSIKeys<TLSIs>> &
  Item;
