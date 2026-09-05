import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Cause, Effect, Option, Schema } from 'effect';
import type {
  ESchemaDescriptor,
  Evolution,
  ForbidEmptyName,
  ForbidOptionalFields,
  ForbidUnderscorePrefix,
  Prettify,
  StructFieldsDecoded,
  StructFieldsEncoded,
  StructFieldsSchema,
} from '../domain/schema-model/index.js';
import { INITIAL_VERSION } from '../domain/schema-model/index.js';
import { ESchemaError } from '../domain/eschema-error/index.js';
import { makeObjectSchemaRuntime } from '../domain/object-schema-runtime/index.js';
import { ESchemaBuilder } from './eschema-builder.js';

function assertName(name: string): void {
  if (name === '') throw new Error('Schema name must not be empty.');
}

const constructionToken = Symbol();

export class ESchema<
  TVersion extends string,
  TLatest extends StructFieldsSchema,
  TName extends string = string,
> implements StandardSchemaV1<unknown, Prettify<StructFieldsDecoded<TLatest>>> {
  readonly #runtime;

  private constructor(
    token: typeof constructionToken,
    readonly name: TName,
    readonly latestVersion: TVersion,
    evolutions: readonly Evolution[],
  ) {
    if (token !== constructionToken) throw new TypeError('Invalid ESchema');
    this.#runtime = makeObjectSchemaRuntime<TVersion, TLatest>({
      owner: this,
      name,
      kind: 'struct',
      idField: null,
      latestVersion,
      evolutions,
    });
  }

  static make<N extends string, I extends StructFieldsSchema>(
    name: N & ForbidEmptyName<N>,
    schema: I & ForbidUnderscorePrefix<I> & ForbidOptionalFields<I>,
  ) {
    assertName(name);
    return new ESchemaBuilder<N, 'v1', I>(
      name,
      [{ version: INITIAL_VERSION, schema, migration: null }],
      INITIAL_VERSION,
      <V extends string, S extends StructFieldsSchema>(
        version: V,
        evolutions: readonly Evolution[],
      ) => new ESchema<V, S, N>(constructionToken, name, version, evolutions),
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

export type { ESchemaError };
