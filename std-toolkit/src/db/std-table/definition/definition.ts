import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaEncoded,
  ESchemaType,
} from '../../../eschema/index.js';
import type { LogicalTableSnapshot } from '../snapshot/index.js';
import { makeTableBuilder } from './table-definition.js';

export type {
  LogicalEntitySnapshot,
  LogicalTableSnapshot,
} from '../snapshot/index.js';

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

type EncodedStringKey<TSchema extends AnyEntityESchema> = {
  [Key in keyof ESchemaEncoded<TSchema> & string]: NonNullable<
    ESchemaEncoded<TSchema>[Key]
  > extends string
    ? Key
    : never;
}[keyof ESchemaEncoded<TSchema> & string];

export type IndexComponent<TSchema extends AnyEntityESchema> =
  | Exclude<EncodedStringKey<TSchema>, '_v'>
  | '_u';

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
    const Pk extends readonly Exclude<IndexComponent<TSchema>, '_u'>[] = [],
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
  snapshot(): LogicalTableSnapshot;
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
