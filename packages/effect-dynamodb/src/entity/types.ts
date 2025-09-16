import type { Primitive } from 'type-fest';

export type FirstLevelPrimitives<T> = {
  [K in keyof T as T[K] extends Primitive ? K : never]: T[K];
};

export type ObjFromKeysArr<T, Keys extends Readonly<any[]>> = Pick<
  T,
  Keys[number]
>;

export interface EntityIndexDefinition<
  TItem,
  PkKeys extends any[],
  SkKeys extends any[],
> {
  pk: IndexDef<TItem, PkKeys>;
  sk: IndexDef<TItem, SkKeys>;
}

export interface IndexDef<TItem, TKeys extends Readonly<any[]>> {
  schema: TKeys;
  derive: (value: ObjFromKeysArr<TItem, TKeys>) => string;
}
