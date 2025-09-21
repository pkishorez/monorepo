import type { Primitive } from 'type-fest';

export type FirstLevelPrimitives<T> = {
  [K in keyof T as T[K] extends Primitive ? K : never]: T[K];
};

export type ObjFromKeysArr<T, Keys extends Readonly<any[]>> =
  Keys extends Readonly<Array<keyof T>> ? Pick<T, Keys[number]> : never;

export interface EntityIndexDefinition<
  TItem,
  PkKeys extends any[],
  SkKeys extends any[],
  // eslint-disable-next-line ts/no-empty-object-type
  AccessPatterns extends Record<string, IndexDef<any, any>> = {},
> {
  pk: IndexDef<TItem, PkKeys>;
  sk: IndexDef<TItem, SkKeys>;
  accessPatterns?: AccessPatterns;
}

export type EmptyEntityIndexDefinition = EntityIndexDefinition<
  any,
  any[],
  any[],
  Record<string, IndexDef<any, any>>
>;

export interface IndexDef<TItem, TKeys extends Readonly<any[]>> {
  deps: TKeys;
  derive: (value: ObjFromKeysArr<TItem, TKeys>) => string;
}

export type ExtractIndexDefType<Def extends IndexDef<any, any>> =
  Def extends IndexDef<infer Item, infer Keys>
    ? ObjFromKeysArr<Item, Keys>
    : never;

export type ExtractEntityIndexDefType<
  Def extends EntityIndexDefinition<any, any, any>,
> = ExtractIndexDefType<Def['pk']> & ExtractIndexDefType<Def['sk']>;
