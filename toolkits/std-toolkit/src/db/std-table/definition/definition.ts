import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import { makeTableBuilder } from './table-definition.js';

export interface PrimaryIndex<
  Pk extends string = string,
  Sk extends string = string,
> {
  readonly pk: Pk;
  readonly sk: Sk;
}

export interface LocalSecondaryIndex<
  Name extends string = string,
  Pk extends string = string,
  Sk extends string = string,
> extends PrimaryIndex<Pk, Sk> {
  readonly name: Name;
  readonly kind: 'lsi';
}

export interface GlobalSecondaryIndex<
  Name extends string = string,
  Pk extends string = string,
  Sk extends string = string,
> extends PrimaryIndex<Pk, Sk> {
  readonly name: Name;
  readonly kind: 'gsi';
}

export type LocalSecondaryIndexMap = Readonly<
  Record<string, LocalSecondaryIndex>
>;
export type GlobalSecondaryIndexMap = Readonly<
  Record<string, GlobalSecondaryIndex>
>;

type KeyLeaf = string | number;
type Depth = [never, 0, 1, 2, 3, 4, 5, 6];
type IsRecord<T> = string extends keyof T
  ? true
  : number extends keyof T
    ? true
    : false;

type Paths<T, Leaf, D extends number> = [D] extends [never]
  ? never
  : T extends unknown
    ? T extends
        | KeyLeaf
        | boolean
        | readonly unknown[]
        | Date
        | ((...args: never[]) => unknown)
      ? never
      : T extends object
        ? IsRecord<T> extends true
          ? never
          : {
              [K in keyof T & string]: NonNullable<T[K]> extends Leaf
                ? K
                : `${K}.${Paths<NonNullable<T[K]>, Leaf, Depth[D]>}`;
            }[keyof T & string]
        : never
    : never;

/**
 * Every dotted path through a value that ends at a `Leaf` (a string or number
 * by default). Union branches are distributed, so a path that exists in only
 * some branches is offered too; arrays, records, and non-plain values are not
 * entered.
 */
export type KeyPath<T, Leaf = KeyLeaf> = Paths<T, Leaf, 6>;

type PathValue<T, P extends string> = T extends unknown
  ? T extends null | undefined
    ? null
    : P extends `${infer Head}.${infer Rest}`
      ? Head extends keyof T
        ? PathValue<T[Head], Rest>
        : undefined
      : P extends keyof T
        ? T[P]
        : undefined
  : never;

/** What a key path reads, across every branch that has it. */
export type KeyPathValue<T, P extends string, Leaf = KeyLeaf> = Extract<
  PathValue<T, P>,
  Leaf
>;

/** A key path that reads a `Leaf` in every branch, never `null`. */
export type TotalKeyPath<T, Leaf = KeyLeaf> = {
  [P in KeyPath<T, Leaf>]: [PathValue<T, P>] extends [Leaf] ? P : never;
}[KeyPath<T, Leaf>];

export type IndexComponent<TSchema extends AnyEntityESchema> =
  | Exclude<KeyPath<ESchemaType<TSchema>>, '_v'>
  | '_u';

export type PrimaryComponent<TSchema extends AnyEntityESchema> = Exclude<
  TotalKeyPath<ESchemaType<TSchema>>,
  '_v'
>;

/** A key record named by key path, such as a key or a query operand. */
export type KeyRecord<
  TSchema extends AnyEntityESchema,
  Paths extends string,
> = {
  readonly [P in Paths]: P extends '_u'
    ? string
    : KeyPathValue<ESchemaType<TSchema>, P>;
};

export interface AccessPatternDefinition<
  Slot extends string | undefined = string | undefined,
  Kind extends 'primary' | 'lsi' | 'gsi' = 'primary' | 'lsi' | 'gsi',
  Pk extends readonly string[] = readonly string[],
  Sk extends readonly string[] = readonly string[],
> {
  readonly index?: Slot;
  readonly kind: Kind;
  readonly pk: Pk;
  readonly sk: Sk;
}

export type AccessPatternMap = Readonly<
  Record<string, AccessPatternDefinition>
>;

export interface KeyedEntityDefinition<
  TableName extends string = string,
  TSchema extends AnyEntityESchema = AnyEntityESchema,
  PrimaryPk extends readonly string[] = readonly string[],
  PrimarySk extends readonly string[] = readonly string[],
  Patterns extends AccessPatternMap = AccessPatternMap,
> {
  readonly kind: 'keyed';
  readonly name: TSchema['name'];
  readonly table: TableDefinition<TableName>;
  readonly schema: TSchema;
  readonly primary: { readonly pk: PrimaryPk; readonly sk: PrimarySk };
  readonly accessPatterns: Patterns;
}

export interface SingleEntityDefinition<
  TableName extends string = string,
  TSchema extends AnyUnkeyedESchema = AnyUnkeyedESchema,
> {
  readonly kind: 'single';
  readonly name: TSchema['name'];
  readonly table: TableDefinition<TableName>;
  readonly schema: TSchema;
  readonly defaultValue: ESchemaType<TSchema>;
}

export interface KeyedEntityBuilderStart<
  TableName extends string,
  TSchema extends AnyEntityESchema,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
> {
  primary<
    const Pk extends readonly PrimaryComponent<TSchema>[] = [],
  >(derivation?: {
    readonly pk: Pk;
  }): KeyedEntityBuilder<
    TableName,
    TSchema,
    Lsis,
    Gsis,
    Pk,
    readonly [TSchema['idField']],
    Record<
      'primary',
      AccessPatternDefinition<
        undefined,
        'primary',
        Pk,
        readonly [TSchema['idField']]
      >
    >
  >;
}

type LsiDerivation<TSchema extends AnyEntityESchema> = {
  readonly sk: readonly IndexComponent<TSchema>[];
  readonly pk?: never;
};

type GsiDerivation<TSchema extends AnyEntityESchema> = {
  readonly pk: readonly IndexComponent<TSchema>[];
  readonly sk?: readonly IndexComponent<TSchema>[];
};

export type PatternFor<
  Slot extends string,
  TSchema extends AnyEntityESchema,
  Lsis extends LocalSecondaryIndexMap,
  Pk extends readonly string[],
  Derivation extends LsiDerivation<TSchema> | GsiDerivation<TSchema>,
> = Slot extends keyof Lsis
  ? AccessPatternDefinition<
      Slot,
      'lsi',
      Pk,
      Derivation extends { readonly sk: infer Sk extends readonly string[] }
        ? Sk
        : never
    >
  : AccessPatternDefinition<
      Slot,
      'gsi',
      Derivation extends { readonly pk: infer GsiPk extends readonly string[] }
        ? GsiPk
        : never,
      Derivation extends { readonly sk: infer GsiSk extends readonly string[] }
        ? GsiSk
        : readonly ['_u']
    >;

export interface KeyedEntityBuilder<
  TableName extends string,
  TSchema extends AnyEntityESchema,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
  PrimaryPk extends readonly string[],
  PrimarySk extends readonly string[],
  Patterns extends AccessPatternMap,
> {
  index<
    const Slot extends keyof (Lsis & Gsis) & string,
    const Name extends string,
    const Derivation extends (Slot extends keyof Lsis
      ? LsiDerivation<TSchema>
      : GsiDerivation<TSchema>),
  >(
    slot: Slot,
    name: Name,
    derivation: Derivation,
  ): KeyedEntityBuilder<
    TableName,
    TSchema,
    Lsis,
    Gsis,
    PrimaryPk,
    PrimarySk,
    Patterns &
      Record<Name, PatternFor<Slot, TSchema, Lsis, PrimaryPk, Derivation>>
  >;
  build(): KeyedEntityDefinition<
    TableName,
    TSchema,
    PrimaryPk,
    PrimarySk,
    Patterns
  >;
}

export interface SingleEntityBuilder<
  TableName extends string,
  TSchema extends AnyUnkeyedESchema,
> {
  default(
    defaultValue: ESchemaType<TSchema>,
  ): SingleEntityDefinition<TableName, TSchema>;
}

export interface TableDefinition<
  Name extends string = string,
  Primary extends PrimaryIndex = PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap = LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap = GlobalSecondaryIndexMap,
> {
  readonly logicalName: Name;
  readonly primary: Primary;
  readonly localSecondaryIndexes: Lsis;
  readonly globalSecondaryIndexes: Gsis;
  entity<TSchema extends AnyEntityESchema>(
    schema: TSchema,
  ): KeyedEntityBuilderStart<Name, TSchema, Lsis, Gsis>;
  singleEntity<TSchema extends AnyUnkeyedESchema>(
    schema: TSchema,
  ): SingleEntityBuilder<Name, TSchema>;
  /** Every entity registered so far, in registration order. Snapshot capture reads this. */
  readonly registeredEntities: readonly (
    | KeyedEntityDefinition
    | SingleEntityDefinition
  )[];
}

export interface TableTopologyBuilder<
  Name extends string,
  Primary extends PrimaryIndex,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
> {
  lsi<const Slot extends string, const Sk extends string>(
    name: Slot,
    sk: Sk,
  ): TableTopologyBuilder<
    Name,
    Primary,
    Lsis & Record<Slot, LocalSecondaryIndex<Slot, Primary['pk'], Sk>>,
    Gsis
  >;
  gsi<
    const Slot extends string,
    const Pk extends string,
    const Sk extends string,
  >(
    name: Slot,
    pk: Pk,
    sk: Sk,
  ): TableTopologyBuilder<
    Name,
    Primary,
    Lsis,
    Gsis & Record<Slot, GlobalSecondaryIndex<Slot, Pk, Sk>>
  >;
  build(): TableDefinition<Name, Primary, Lsis, Gsis>;
}

export interface TableBuilder<Name extends string> {
  readonly logicalName: Name;
  primary<const Pk extends string, const Sk extends string>(
    pk: Pk,
    sk: Sk,
  ): TableTopologyBuilder<Name, PrimaryIndex<Pk, Sk>, {}, {}>;
}

type NonEmpty<Name extends string> = Name extends '' ? never : Name;

export const Table = {
  make<const Name extends string>(
    logicalName: NonEmpty<Name>,
  ): TableBuilder<Name> {
    return makeTableBuilder(logicalName);
  },
  assertUniqueNames<const Definitions extends readonly TableDefinition[]>(
    definitions: Definitions,
  ): Definitions {
    const names = new Set<string>();
    for (const definition of definitions) {
      if (names.has(definition.logicalName)) {
        throw new Error(
          `Logical Table "${definition.logicalName}" is already defined`,
        );
      }
      names.add(definition.logicalName);
    }
    return definitions;
  },
} as const;
