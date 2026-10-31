import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
  ESchemaType,
} from '../../../eschema/index.js';
import { keyPathRefusal } from './key-path-shape.js';
import type {
  AccessPatternMap,
  EntityDeclaration,
  GlobalSecondaryIndexMap,
  KeyedEntityBuilderStart,
  KeyedEntityDeclaration,
  KeyedEntityDefinition,
  LocalSecondaryIndexMap,
  SingleEntityDeclaration,
  SingleEntityDefinition,
  TableDefinition,
} from './definition.js';

export type RegisteredEntity = KeyedEntityDefinition | SingleEntityDefinition;

const assertComponents = (
  schema: AnyEntityESchema,
  components: readonly string[],
  place: 'primary' | 'secondary',
): void => {
  for (const component of components) {
    if (component === '_u') {
      if (place === 'secondary') continue;
      throw new Error(
        'Index component "_u" is only allowed in a secondary index',
      );
    }
    const reason = keyPathRefusal(schema, component, {
      total: place === 'primary',
    });
    if (reason !== undefined)
      throw new Error(`Index component "${component}" ${reason}`);
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
  readonly declaration: KeyedEntityDeclaration;
  index(
    slot: string,
    name: string,
    derivation: {
      readonly pk?: readonly string[];
      readonly sk?: readonly string[];
    },
  ): KeyedEntityBuilderRuntime;
}

type IndexSlots = Pick<
  TableDefinition,
  'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

const makeIndexesBuilder = (
  slots: IndexSlots,
  declaration: KeyedEntityDeclaration,
): KeyedEntityBuilderRuntime => ({
  declaration,
  index(slot, name, derivation) {
    const { schema, accessPatterns: patterns } = declaration;
    if (name === '') throw new Error('Access-pattern name must not be empty');
    if (Object.hasOwn(patterns, name)) {
      throw new Error(`Access pattern "${name}" is already defined`);
    }
    if (Object.values(patterns).some((pattern) => pattern.index === slot))
      throw new Error(`Index slot "${slot}" is already used by this Entity`);
    const lsi = slots.localSecondaryIndexes[slot];
    const gsi = slots.globalSecondaryIndexes[slot];
    if (lsi === undefined && gsi === undefined) {
      throw new Error(`Index slot "${slot}" is not defined`);
    }
    const source = derivation as {
      readonly pk?: readonly string[];
      readonly sk?: readonly string[];
    };
    const pk = lsi === undefined ? (source.pk ?? []) : declaration.primary.pk;
    const sk = source.sk ?? ['_u'];
    if (lsi !== undefined && source.pk !== undefined) {
      throw new Error(
        'An LSI access pattern inherits its primary partition key',
      );
    }
    if (gsi !== undefined && source.pk === undefined) {
      throw new Error('A GSI access pattern requires partition-key components');
    }
    if (lsi === undefined) assertComponents(schema, pk, 'secondary');
    assertComponents(schema, sk, 'secondary');
    return makeIndexesBuilder(slots, {
      ...declaration,
      accessPatterns: {
        ...patterns,
        [name]: Object.freeze({
          index: slot,
          kind: lsi === undefined ? 'gsi' : 'lsi',
          pk: Object.freeze([...pk]),
          sk: Object.freeze([...sk]),
        }),
      },
    });
  },
});

/** The first step of declaring a keyed entity against a table's index slots. */
export const startKeyedEntity = <
  TSchema extends AnyEntityESchema,
  Lsis extends LocalSecondaryIndexMap,
  Gsis extends GlobalSecondaryIndexMap,
>(
  slots: IndexSlots,
  schema: TSchema,
): KeyedEntityBuilderStart<TSchema, Lsis, Gsis> => ({
  primary(derivation) {
    const pk = derivation?.pk ?? [];
    assertComponents(schema, pk, 'primary');
    assertComponents(schema, [schema.idField], 'primary');
    const primary = Object.freeze({
      pk: Object.freeze([...pk]),
      sk: Object.freeze([schema.idField] as const),
    });
    return makeIndexesBuilder(slots, {
      kind: 'keyed',
      schema,
      primary,
      accessPatterns: {
        primary: Object.freeze({ kind: 'primary', ...primary }),
      },
    }) as never;
  },
});

export const declareSingleEntity = <TSchema extends AnyUnkeyedESchema>(
  schema: TSchema,
  defaultValue: ESchemaType<TSchema>,
): SingleEntityDeclaration<TSchema> =>
  Object.freeze({ kind: 'single', schema, defaultValue });

/** An entity's definition once its table exists. */
export const defineEntity = (
  table: TableDefinition,
  declaration: EntityDeclaration,
): RegisteredEntity =>
  declaration.kind === 'keyed'
    ? Object.freeze({
        kind: 'keyed',
        name: declaration.schema.name,
        table,
        schema: declaration.schema,
        primary: declaration.primary,
        accessPatterns: sortPatterns(declaration.accessPatterns),
      })
    : Object.freeze({
        kind: 'single',
        name: declaration.schema.name,
        table,
        schema: declaration.schema,
        defaultValue: declaration.defaultValue,
      });
