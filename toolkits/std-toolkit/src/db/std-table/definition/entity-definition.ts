import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import { isEncodedStringSchema } from '../../../eschema/domain/introspection/index.js';
import type {
  AccessPatternMap,
  KeyedEntityBuilderStart,
  KeyedEntityDefinition,
  GlobalSecondaryIndexMap,
  LocalSecondaryIndexMap,
  PrimaryIndex,
  SingleEntityBuilder,
  SingleEntityDefinition,
  TableDefinition,
} from './definition.js';

export type RegisteredEntity = KeyedEntityDefinition | SingleEntityDefinition;

const assertComponents = (
  schema: AnyEntityESchema,
  components: readonly string[],
): void => {
  for (const component of components) {
    if (component === '_u') continue;
    const field = schema.fields[component];
    if (field === undefined || !isEncodedStringSchema(field)) {
      throw new Error(`Index component "${component}" must encode to a string`);
    }
  }
};

const sortPatterns = (patterns: AccessPatternMap): AccessPatternMap =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(patterns).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    ),
  );

interface KeyedEntityBuilderRuntime {
  index(
    slot: string,
    name: string,
    derivation: {
      readonly pk?: readonly string[];
      readonly sk?: readonly string[];
    },
  ): KeyedEntityBuilderRuntime;
  build(): KeyedEntityDefinition;
}

const makeIndexesBuilder = (
  table: TableDefinition,
  schema: AnyEntityESchema,
  primaryPk: readonly string[],
  patterns: AccessPatternMap,
  register: (entity: RegisteredEntity) => void,
): KeyedEntityBuilderRuntime => ({
  index(slot, name, derivation) {
    if (name === '') throw new Error('Access-pattern name must not be empty');
    if (Object.hasOwn(patterns, name)) {
      throw new Error(`Access pattern "${name}" is already defined`);
    }
    if (Object.values(patterns).some((pattern) => pattern.index === slot))
      throw new Error(`Index slot "${slot}" is already used by this Entity`);
    const lsi = table.localSecondaryIndexes[slot];
    const gsi = table.globalSecondaryIndexes[slot];
    if (lsi === undefined && gsi === undefined) {
      throw new Error(`Index slot "${slot}" is not defined`);
    }
    const source = derivation as {
      readonly pk?: readonly string[];
      readonly sk?: readonly string[];
    };
    const pk = lsi === undefined ? (source.pk ?? []) : primaryPk;
    const sk = source.sk ?? ['_u'];
    if (lsi !== undefined && source.pk !== undefined) {
      throw new Error(
        'An LSI access pattern inherits its primary partition key',
      );
    }
    if (gsi !== undefined && source.pk === undefined) {
      throw new Error('A GSI access pattern requires partition-key components');
    }
    assertComponents(schema, pk);
    assertComponents(schema, sk);
    const next = {
      ...patterns,
      [name]: Object.freeze({
        index: slot,
        kind: lsi === undefined ? 'gsi' : 'lsi',
        pk: Object.freeze([...pk]),
        sk: Object.freeze([...sk]),
      }),
    } as AccessPatternMap;
    return makeIndexesBuilder(
      table,
      schema,
      primaryPk,
      next,
      register,
    ) as never;
  },
  build() {
    assertComponents(schema, primaryPk);
    assertComponents(schema, [schema.idField]);
    const entity = Object.freeze({
      kind: 'keyed' as const,
      name: schema.name,
      table,
      schema,
      primary: Object.freeze({
        pk: Object.freeze([...primaryPk]),
        sk: Object.freeze([schema.idField]),
      }),
      accessPatterns: sortPatterns(patterns),
    });
    register(entity);
    return entity;
  },
});

export const makeKeyedEntityBuilder = <
  Name extends string,
  TSchema extends AnyEntityESchema,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
>(
  table: TableDefinition<Name, PrimaryIndex, Lsis, Gsis>,
  schema: TSchema,
  register: (entity: RegisteredEntity) => void,
): KeyedEntityBuilderStart<Name, TSchema, Lsis, Gsis> => ({
  primary(derivation) {
    const pk = derivation?.pk ?? [];
    assertComponents(schema, pk);
    return makeIndexesBuilder(
      table,
      schema,
      pk,
      {
        primary: Object.freeze({
          kind: 'primary',
          pk: Object.freeze([...pk]),
          sk: Object.freeze([schema.idField]),
        }),
      },
      register,
    ) as never;
  },
});

export const makeSingleEntityBuilder = <
  Name extends string,
  TSchema extends AnyUnkeyedESchema,
>(
  table: TableDefinition<Name>,
  schema: TSchema,
  register: (entity: RegisteredEntity) => void,
): SingleEntityBuilder<Name, TSchema> => ({
  default(defaultValue: ESchemaType<TSchema>) {
    const entity = Object.freeze({
      kind: 'single' as const,
      name: schema.name,
      table,
      schema,
      defaultValue,
    }) as SingleEntityDefinition<Name, TSchema>;
    register(entity);
    return entity;
  },
});
