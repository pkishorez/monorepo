import { Primitive } from 'type-fest';

export type ObjFromKeysArr<T, Keys extends Readonly<any[]>> =
  Keys extends Readonly<Array<keyof T>> ? Pick<T, Keys[number]> : never;

export type IndexDefinition = {
  pk: string;
  sk: string;
};

export interface IndexDerivation<
  TPk extends IndexKeyDerivation<any, any>,
  TSk extends IndexKeyDerivation<any, any>,
> {
  pk: TPk;
  sk: TSk;
}

export interface IndexKeyDerivation<TItem, TKeys extends keyof TItem> {
  deps: TKeys[];
  derive: (value: Pick<TItem, TKeys>) => Primitive[];
}

export type IndexDerivationValue<ID extends IndexDerivation<any, any>> =
  ID extends IndexDerivation<infer TPk, infer TSk>
    ? IndexKeyDerivationValue<TPk> & IndexKeyDerivationValue<TSk>
    : never;
export type IndexKeyDerivationValue<ID extends IndexKeyDerivation<any, any>> =
  ID extends IndexKeyDerivation<infer TItem, infer TKeys>
    ? Pick<TItem, TKeys>
    : never;

export type EmptyIndexDerivation = IndexDerivation<
  IndexKeyDerivation<any, any>,
  IndexKeyDerivation<any, any>
>;

export type SortKeyparameter<Type = string> =
  | { beginsWith: string | null }
  | { between: [Type, Type] | null }
  | { '<': Type | null }
  | { '<=': Type | null }
  | { '>': Type | null }
  | { '>=': Type | null };
