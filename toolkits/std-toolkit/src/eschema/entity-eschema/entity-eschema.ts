import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Cause, Effect, Option, Schema } from 'effect';
import type {
  ESchemaDescriptor,
  Evolution,
  ForbidEmptyName,
  ForbidIdField,
  ForbidOptionalFields,
  ForbidUnderscorePrefix,
  Prettify,
  StructFieldsDecoded,
  StructFieldsEncoded,
  StructFieldsSchema,
} from '../domain/schema-model/index.js';
import { INITIAL_VERSION } from '../domain/schema-model/index.js';
import { makeObjectSchemaRuntime } from '../domain/object-schema-runtime/index.js';
import { EntityESchemaBuilder } from './entity-eschema-builder.js';

function assertName(name: string): void {
  if (name === '') throw new Error('Schema name must not be empty.');
}

const constructionToken = Symbol();

export class EntityESchema<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> implements StandardSchemaV1<unknown, Prettify<StructFieldsDecoded<TLatest>>> {
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
    return new EntityESchemaBuilder<N, Id, 'v1', typeof initial>(
      name,
      idField,
      idSchema,
      [{ version: INITIAL_VERSION, schema: initial, migration: null }],
      INITIAL_VERSION,
      <V extends string, S extends StructFieldsSchema>(
        version: V,
        evolutions: readonly Evolution[],
      ) =>
        new EntityESchema<N, Id, V, S>(
          constructionToken,
          name,
          idField,
          version,
          evolutions,
        ),
    );
  }

  Type = null as unknown as Prettify<StructFieldsDecoded<TLatest>>;
  Encoded = null as unknown as Prettify<StructFieldsEncoded<TLatest>> & {
    readonly _v: TVersion;
  };

  get fields(): TLatest {
    return this.#runtime.fields();
  }

  get schema(): Schema.Struct<TLatest> {
    return Schema.Struct(this.fields);
  }

  makePartial(value: Partial<StructFieldsDecoded<TLatest>>) {
    return { ...value, _v: this.latestVersion };
  }

  decode(value: unknown) {
    return this.#runtime.decode(value);
  }

  encode(value: StructFieldsDecoded<TLatest>) {
    return this.#runtime.encode(value);
  }

  getDescriptor(): ESchemaDescriptor {
    return this.#runtime.descriptor();
  }

  '~standard' = {
    version: 1 as const,
    vendor: 'std-toolkit/eschema',
    types: {
      input: null as unknown as Prettify<StructFieldsDecoded<TLatest>>,
      output: null as unknown as Prettify<StructFieldsDecoded<TLatest>>,
    },
    validate: (value: unknown) => {
      const result = Effect.runSyncExit(this.decode(value));
      if (result._tag === 'Success') return { value: result.value };
      const error = Cause.findErrorOption(result.cause);
      return Option.isSome(error)
        ? { issues: [{ message: error.value.message }] }
        : { issues: [{ message: 'Unknown error' }] };
    },
  };
}
