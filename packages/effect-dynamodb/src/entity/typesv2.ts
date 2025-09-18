import { Primitive } from 'type-fest';

export type FirstLevelPrimitives<T> = {
  [K in keyof T as T[K] extends Primitive ? K : never]: T[K];
};

type IndexDef<Item, Keys extends (keyof FirstLevelPrimitives<Item>)[]> = {
  deps: Keys;
  derive: (value: Keys) => string;
};

type Item = {
  a: string;
  b: number;
  c: boolean;
  d: true;
  e: { f: string };
};
type T1 = IndexDef<Item, []>;
type T2 = IndexDef<Item, []>;

type TypeFromIndexDef<index extends IndexDef<any, any>> =
  index extends IndexDef<any, infer Arr> ? Arr[number] : never;

type T3 = TypeFromIndexDef<T1> | TypeFromIndexDef<T2>;
