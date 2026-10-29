import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Cause, Effect, Option, Schema } from 'effect';
import type {
  ESchemaDescriptor,
  Evolution,
  ForbidEmptyName,
  ForbidIdField,
  ForbidOptionalFields,
  ForbidUnderscorePrefix,
  EntitySchemaOf,
  Prettify,
  StructFieldsType,
  StructFieldsEncoded,
  StructFieldsSchema,
  VersionedCodec,
  VersionShapes,
} from '../domain/schema-model/index.js';
import { INITIAL_VERSION } from '../domain/schema-model/index.js';
import { makeObjectSchemaRuntime } from '../domain/object-schema-runtime/index.js';
import { latestSchema } from '../domain/introspection/index.js';
import { versionedSchema } from '../domain/versioned-schema/index.js';
import { entitySchema } from '../domain/entity-schema/index.js';
import { EntityESchemaBuilder } from './entity-eschema-builder.js';

function assertName(name: string): void {
  if (name === '') throw new Error('Schema name must not be empty.');
}

const constructionToken = Symbol();

type LatestType<TLatest extends StructFieldsSchema> = Prettify<
  StructFieldsType<TLatest>
>;

export class EntityESchema<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
  TVersions extends VersionShapes = VersionShapes,
> implements StandardSchemaV1<unknown, LatestType<TLatest>> {
  readonly #runtime;

  private constructor(
    token: typeof constructionToken,
    readonly name: TName,
    readonly idField: TIdField,
    readonly latestVersion: TVersion,
    evolutions: readonly Evolution[],
  ) {
    if (token !== constructionToken) {
      throw new TypeError('Invalid EntityESchema');
    }
    this.#runtime = makeObjectSchemaRuntime<TVersion, TLatest>({
      owner: this,
      name,
      kind: 'entity',
      idField,
      latestVersion,
      evolutions,
    });
  }

  static make<
    N extends string,
    Id extends string,
    I extends StructFieldsSchema,
  >(
    name: N & ForbidEmptyName<N>,
    idField: Id,
    schema: I &
      ForbidUnderscorePrefix<I> &
      ForbidIdField<I, Id> &
      ForbidOptionalFields<I>,
  ) {
    assertName(name);
    const idSchema = Schema.String as Schema.Codec<string, string>;
    const initial = { ...schema, [idField]: idSchema } as I &
      Record<Id, Schema.Codec<string, string>>;
    return new EntityESchemaBuilder<
      N,
      Id,
      'v1',
      typeof initial,
      { readonly v1: { readonly fields: typeof initial; readonly gap: false } }
    >(
      name,
      idField,
      idSchema,
      [{ version: INITIAL_VERSION, schema: initial, migration: null }],
      INITIAL_VERSION,
      <V extends string, S extends StructFieldsSchema, H extends VersionShapes>(
        version: V,
        evolutions: readonly Evolution[],
      ) =>
        new EntityESchema<N, Id, V, S, H>(
          constructionToken,
          name,
          idField,
          version,
          evolutions,
        ),
    );
  }

  /**
   * Type carrier for every version: its fields, and whether it is a gap
   * version. Read it through `ESchemaVersions`, `VersionValue` and
   * `GapVersions`.
   */
  Versions = null as unknown as TVersions;
  Type = null as unknown as LatestType<TLatest>;
  Encoded = null as unknown as Prettify<StructFieldsEncoded<TLatest>> & {
    readonly _v: TVersion;
  };

  get fields(): TLatest {
    return this.#runtime.fields();
  }

  get schema(): VersionedCodec<this['Type'], this['Encoded']> {
    return versionedSchema(this);
  }

  get entity(): EntitySchemaOf<this['Type'], this['Encoded']> {
    return entitySchema(this);
  }

  getDescriptor(): ESchemaDescriptor {
    return this.#runtime.descriptor();
  }

  '~standard' = {
    version: 1 as const,
    vendor: '@kestack/std-toolkit/eschema',
    types: {
      input: null as unknown as LatestType<TLatest>,
      output: null as unknown as LatestType<TLatest>,
    },
    validate: (value: unknown) => {
      const result = Effect.runSyncExit(
        Schema.decodeUnknownEffect(Schema.toType(latestSchema(this)))(value),
      );
      if (result._tag === 'Success') {
        return { value: result.value as LatestType<TLatest> };
      }
      const error = Cause.findErrorOption(result.cause);
      return Option.isSome(error)
        ? { issues: [{ message: error.value.message }] }
        : { issues: [{ message: 'Unknown error' }] };
    },
  };
}
