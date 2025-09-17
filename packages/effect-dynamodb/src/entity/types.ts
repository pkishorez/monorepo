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
  // eslint-disable-next-line ts/no-empty-object-type
  Prefixes extends Record<string, ObjIndexDef<any, any>> = {},
> {
  pk: IndexDef<TItem, PkKeys>;
  sk: IndexDef<TItem, SkKeys>;
  prefixes?: Prefixes;
}

export interface ObjIndexDef<TItem, TKeys extends Readonly<any[]>> {
  deps: TKeys;
  derive: (value: ObjFromKeysArr<TItem, TKeys>) => string;
}

export type IndexDef<TItem, TKeys extends Readonly<any[]>> =
  | string
  | ObjIndexDef<TItem, TKeys>;

export type ExtractIndexDefType<Def extends IndexDef<any, any>> =
  Def extends IndexDef<infer Item, infer Keys>
    ? ObjFromKeysArr<Item, Keys>
    : never;

export type ExtractEntityIndexDefType<
  Def extends EntityIndexDefinition<any, any, any>,
> = ExtractIndexDefType<Def['pk']> & ExtractIndexDefType<Def['sk']>;
