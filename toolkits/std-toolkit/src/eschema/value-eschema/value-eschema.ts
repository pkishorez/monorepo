import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Cause, Effect, Option, Schema } from 'effect';
import type {
  ESchemaDescriptor,
  ForbidEmptyName,
  ForbidUndefinedValue,
  ForbidUnderscorePrefixValue,
  ValueEnvelopeEncoded,
  ValueEvolution,
  ValueSchema,
  ValueSchemaType,
} from '../domain/schema-model/index.js';
import { INITIAL_VERSION } from '../domain/schema-model/index.js';
import { makeValueSchemaRuntime } from './value-schema-runtime/index.js';
import { ValueESchemaBuilder } from './value-eschema-builder.js';

function assertName(name: string): void {
  if (name === '') throw new Error('Schema name must not be empty.');
}

const constructionToken = Symbol();

export class ValueESchema<
  TVersion extends string,
  TLatest extends ValueSchema,
> implements StandardSchemaV1<unknown, ValueSchemaType<TLatest>> {
  readonly #runtime;

  private constructor(
    token: typeof constructionToken,
    readonly name: string,
    readonly latestVersion: TVersion,
    evolutions: readonly ValueEvolution[],
  ) {
    if (token !== constructionToken) {
      throw new TypeError('Invalid ValueESchema');
    }
    this.#runtime = makeValueSchemaRuntime<TVersion, TLatest>({
      owner: this,
      name,
      latestVersion,
      evolutions,
    });
  }

  static make<N extends string, S extends ValueSchema>(
    name: N & ForbidEmptyName<N>,
    schema: S & ForbidUndefinedValue<S> & ForbidUnderscorePrefixValue<S>,
  ) {
    assertName(name);
    return new ValueESchemaBuilder<'v1', S>(
      name,
      [{ version: INITIAL_VERSION, schema, migration: null }],
      INITIAL_VERSION,
      <V extends string, Latest extends ValueSchema>(
        version: V,
        evolutions: readonly ValueEvolution[],
      ) =>
        new ValueESchema<V, Latest>(
          constructionToken,
          name,
          version,
          evolutions,
        ),
    );
  }

  Type = null as unknown as ValueSchemaType<TLatest>;
  Encoded = null as unknown as ValueEnvelopeEncoded<TVersion, TLatest>;

  get schema(): TLatest {
    return this.#runtime.schema();
  }

  getDescriptor(): ESchemaDescriptor {
    return this.#runtime.descriptor();
  }

  '~standard' = {
    version: 1 as const,
    vendor: 'std-toolkit/eschema',
    types: {
      input: null as unknown as ValueSchemaType<TLatest>,
      output: null as unknown as ValueSchemaType<TLatest>,
    },
    validate: (value: unknown) => {
      const result = Effect.runSyncExit(
        Schema.decodeUnknownEffect(Schema.toType(this.schema))(value),
      );
      if (result._tag === 'Success') {
        return { value: result.value as ValueSchemaType<TLatest> };
      }
      const error = Cause.findErrorOption(result.cause);
      return Option.isSome(error)
        ? { issues: [{ message: error.value.message }] }
        : { issues: [{ message: 'Unknown error' }] };
    },
  };
}
