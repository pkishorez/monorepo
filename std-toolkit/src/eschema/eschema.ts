import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  Cause,
  Effect,
  Option,
  Schema,
  SchemaGetter,
  SchemaIssue,
} from 'effect';
import type {
  IdSchema,
  ESchemaDescriptor,
  Evolution,
  ForbidUnderscorePrefix,
  ForbidIdField,
  Prettify,
  StructFieldsDecoded,
  StructFieldsEncoded,
  StructFieldsSchema,
  ValueEnvelopeEncoded,
  ValueEvolution,
  ValueSchema,
  ValueSchemaDecoded,
  ValueSchemaEncoded,
} from './types.js';
import { ESchemaError } from './utils.js';
import { struct, metaSchema, INITIAL_VERSION } from './schema.js';
import {
  ESchemaBuilder,
  SingleEntityESchemaBuilder,
  EntityESchemaBuilder,
  ValueESchemaBuilder,
} from './internal/builders.js';

function hasVersionStamp(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && '_v' in value;
}

function toDescriptor(schema: Schema.Top): ESchemaDescriptor {
  const { schema: root, definitions } = Schema.toJsonSchemaDocument(schema);
  const descriptor = { ...root } as ESchemaDescriptor;
  if (Object.keys(definitions).length > 0) {
    descriptor.$defs = definitions;
  }
  return descriptor;
}

export class ESchema<
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> implements StandardSchemaV1<unknown, Prettify<StructFieldsDecoded<TLatest>>> {
  constructor(
    readonly latestVersion: TVersion,
    private evolutions: Evolution[] = [],
  ) {}

  makePartial(value: Partial<StructFieldsDecoded<TLatest>>) {
    return { ...value, _v: this.latestVersion };
  }

  Type = null as unknown as Prettify<StructFieldsDecoded<TLatest>>;
  Encoded = null as unknown as Prettify<StructFieldsEncoded<TLatest>> & {
    readonly _v: TVersion;
  };

  get fields(): TLatest {
    const lastEvolution = this.evolutions?.at(-1);
    if (!lastEvolution?.schema) {
      throw new Error(
        `ESchema is not properly initialized. ` +
          `This usually happens when the schema is accessed before module initialization completes. ` +
          `Consider using lazy initialization or avoiding top-level schema computations.`,
      );
    }
    return lastEvolution.schema as TLatest;
  }

  get schema(): Schema.Struct<TLatest> {
    return Schema.Struct(this.fields);
  }

  decode(
    value: unknown,
  ): Effect.Effect<Prettify<StructFieldsDecoded<TLatest>>, ESchemaError> {
    return Effect.gen({ self: this }, function* () {
      const _v = yield* Schema.decodeUnknownEffect(metaSchema)(value).pipe(
        Effect.map((v) => v._v),
        Effect.orElseSucceed(
          () => this.evolutions[0]?.version ?? this.latestVersion,
        ),
      );
      const index = this.evolutions.findIndex((v) => v.version === _v);
      const evolution = this.evolutions[index];

      if (index === -1 || !evolution) {
        return yield* new ESchemaError({
          message: `Unknown schema version: ${_v}`,
        });
      }

      let data = yield* Schema.decodeUnknownEffect(struct(evolution.schema))(
        value,
      ).pipe(
        Effect.mapError(
          (err) => new ESchemaError({ message: 'Decode failed', cause: err }),
        ),
      );

      for (let i = index + 1; i < this.evolutions.length; i++) {
        const evo = this.evolutions[i];
        if (!evo) {
          return yield* new ESchemaError({ message: 'Migration not found' });
        }
        data = evo.migration!(data);
      }

      return data as StructFieldsDecoded<TLatest>;
    });
  }

  encode(
    value: StructFieldsDecoded<TLatest>,
  ): Effect.Effect<
    Prettify<StructFieldsEncoded<TLatest>> & { readonly _v: TVersion },
    ESchemaError,
    never
  > {
    return Effect.gen({ self: this }, function* () {
      const evolution = this.evolutions.at(-1);
      if (!evolution) {
        return yield* new ESchemaError({ message: 'No evolutions found' });
      }

      const data = yield* Schema.encodeEffect(struct(this.fields))(value).pipe(
        Effect.mapError(
          (error) =>
            new ESchemaError({ message: 'Encode failed', cause: error }),
        ),
      );

      return {
        ...data,
        _v: this.latestVersion,
      } as Prettify<StructFieldsEncoded<TLatest>> & { readonly _v: TVersion };
    });
  }

  getDescriptor(): ESchemaDescriptor {
    const schemaWithVersion = Schema.Struct({
      ...this.fields,
      _v: Schema.Literal(this.latestVersion),
    });
    return toDescriptor(schemaWithVersion);
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
      if (result._tag === 'Success') {
        return { value: result.value };
      }
      const error = Cause.findErrorOption(result.cause);
      if (Option.isSome(error)) {
        return { issues: [{ message: error.value.message }] };
      }
      return { issues: [{ message: 'Unknown error' }] };
    },
  };
}

export namespace ESchema {
  export function make<I extends StructFieldsSchema>(
    schema: I & ForbidUnderscorePrefix<I>,
  ) {
    return new ESchemaBuilder<'v1', I>(
      [{ version: INITIAL_VERSION, schema, migration: null }],
      INITIAL_VERSION,
    );
  }
}

// Strip static side so subclasses don't inherit namespace `make`
const ESchemaBase: new <
  TVersion extends string,
  TLatest extends StructFieldsSchema,
>(
  latestVersion: TVersion,
  evolutions?: Evolution[],
) => ESchema<TVersion, TLatest> = ESchema;

export class SingleEntityESchema<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> extends ESchemaBase<TVersion, TLatest> {
  constructor(
    readonly name: TName,
    latestVersion: TVersion,
    evolutions: Evolution[] = [],
  ) {
    super(latestVersion, evolutions);
  }
}

export namespace SingleEntityESchema {
  export function make<N extends string, I extends StructFieldsSchema>(
    name: N,
    schema: I & ForbidUnderscorePrefix<I>,
  ) {
    return new SingleEntityESchemaBuilder<N, 'v1', I>(
      name,
      [{ version: INITIAL_VERSION, schema, migration: null }],
      INITIAL_VERSION,
    );
  }
}

export class EntityESchema<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> extends ESchemaBase<TVersion, TLatest> {
  constructor(
    readonly name: TName,
    readonly idField: TIdField,
    latestVersion: TVersion,
    evolutions: Evolution[] = [],
  ) {
    super(latestVersion, evolutions);
  }
}

export namespace EntityESchema {
  export function make<
    N extends string,
    Id extends string,
    I extends StructFieldsSchema,
  >(
    name: N,
    idField: Id,
    schema: I & ForbidUnderscorePrefix<I> & ForbidIdField<I, Id>,
  ) {
    const idSchema = Schema.String as IdSchema;
    const schemaWithId = { ...schema, [idField]: idSchema } as I &
      Record<Id, IdSchema>;

    return new EntityESchemaBuilder<N, Id, 'v1', I & Record<Id, IdSchema>>(
      name,
      idField,
      idSchema,
      [{ version: INITIAL_VERSION, schema: schemaWithId, migration: null }],
      INITIAL_VERSION,
    );
  }
}

export class ValueESchema<
  TVersion extends string,
  TLatest extends ValueSchema,
> implements StandardSchemaV1<unknown, ValueSchemaDecoded<TLatest>> {
  constructor(
    readonly latestVersion: TVersion,
    private evolutions: ValueEvolution[] = [],
  ) {}

  Type = null as unknown as ValueSchemaDecoded<TLatest>;
  Encoded = null as unknown as ValueEnvelopeEncoded<TVersion, TLatest>;

  get schema(): TLatest {
    const lastEvolution = this.evolutions?.at(-1);
    if (!lastEvolution?.schema) {
      throw new Error(
        `ValueESchema is not properly initialized. ` +
          `This usually happens when the schema is accessed before module initialization completes. ` +
          `Consider using lazy initialization or avoiding top-level schema computations.`,
      );
    }
    return lastEvolution.schema as TLatest;
  }

  decode(
    value: unknown,
  ): Effect.Effect<ValueSchemaDecoded<TLatest>, ESchemaError> {
    return Effect.gen({ self: this }, function* () {
      const isEnvelope = hasVersionStamp(value);
      const _v = isEnvelope
        ? yield* Schema.decodeUnknownEffect(metaSchema)(value).pipe(
            Effect.map((v) => v._v),
            Effect.mapError(
              (err) =>
                new ESchemaError({ message: 'Decode failed', cause: err }),
            ),
          )
        : (this.evolutions[0]?.version ?? this.latestVersion);

      const index = this.evolutions.findIndex((v) => v.version === _v);
      const evolution = this.evolutions[index];

      if (index === -1 || !evolution) {
        return yield* new ESchemaError({
          message: `Unknown schema version: ${_v}`,
        });
      }

      const input = isEnvelope ? value.value : value;
      let data = yield* Schema.decodeUnknownEffect(evolution.schema)(
        input,
      ).pipe(
        Effect.mapError(
          (err) => new ESchemaError({ message: 'Decode failed', cause: err }),
        ),
      );

      for (let i = index + 1; i < this.evolutions.length; i++) {
        const evo = this.evolutions[i];
        if (!evo) {
          return yield* new ESchemaError({ message: 'Migration not found' });
        }
        data = evo.migration!(data);
      }

      return data as ValueSchemaDecoded<TLatest>;
    });
  }

  encode(
    value: ValueSchemaDecoded<TLatest>,
  ): Effect.Effect<ValueEnvelopeEncoded<TVersion, TLatest>, ESchemaError> {
    return Effect.gen({ self: this }, function* () {
      if (this.evolutions.length === 0) {
        return yield* new ESchemaError({ message: 'No evolutions found' });
      }

      const data = yield* Schema.encodeEffect(this.schema)(value).pipe(
        Effect.mapError(
          (error) =>
            new ESchemaError({ message: 'Encode failed', cause: error }),
        ),
      );

      return {
        _v: this.latestVersion,
        value: data,
      } as ValueEnvelopeEncoded<TVersion, TLatest>;
    });
  }

  getDescriptor(): ESchemaDescriptor {
    const schemaWithVersion = Schema.Struct({
      _v: Schema.Literal(this.latestVersion),
      value: this.schema,
    });
    return toDescriptor(schemaWithVersion);
  }

  '~standard' = {
    version: 1 as const,
    vendor: 'std-toolkit/eschema',
    types: {
      input: null as unknown as ValueSchemaDecoded<TLatest>,
      output: null as unknown as ValueSchemaDecoded<TLatest>,
    },
    validate: (value: unknown) => {
      const result = Effect.runSyncExit(this.decode(value));
      if (result._tag === 'Success') {
        return { value: result.value };
      }
      const error = Cause.findErrorOption(result.cause);
      if (Option.isSome(error)) {
        return { issues: [{ message: error.value.message }] };
      }
      return { issues: [{ message: 'Unknown error' }] };
    },
  };
}

export namespace ValueESchema {
  export function make<S extends ValueSchema>(schema: S) {
    return new ValueESchemaBuilder<'v1', S>(
      [{ version: INITIAL_VERSION, schema, migration: null }],
      INITIAL_VERSION,
    );
  }
}

export interface ToSchemaOptions {
  /**
   * Identifier to use for the resulting schema (drives the OpenAPI / JSON
   * Schema `$defs` key). Takes precedence over the eschema's own `name`. An
   * explicit name is required whenever the eschema is anonymous.
   */
  readonly name?: string;
}

export function toSchema<V extends string, L extends StructFieldsSchema>(
  eschema: ESchema<V, L>,
  options?: ToSchemaOptions,
): Schema.Codec<
  StructFieldsDecoded<L>,
  StructFieldsEncoded<L> & { readonly _v: string }
>;
export function toSchema<V extends string, L extends ValueSchema>(
  eschema: ValueESchema<V, L>,
  options?: ToSchemaOptions,
): Schema.Codec<
  ValueSchemaDecoded<L>,
  { readonly _v: string; readonly value: ValueSchemaEncoded<L> }
>;
export function toSchema(
  eschema:
    | ESchema<string, StructFieldsSchema>
    | ValueESchema<string, ValueSchema>,
  options?: ToSchemaOptions,
): any {
  const isValue = eschema instanceof ValueESchema;
  const name = options?.name ?? (eschema as { name?: string }).name;
  if (name === undefined || name === '') {
    const kind = isValue ? 'ValueESchema' : 'ESchema';
    throw new Error(
      `toSchema: cannot derive an identifier from an anonymous ${kind}. ` +
        `Build it with a name (e.g. SingleEntityESchema.make / EntityESchema.make) ` +
        `or pass one explicitly: toSchema(schema, { name: 'MyName' }).`,
    );
  }
  const identifier = isValue ? `ValueESchema(${name})` : `ESchema(${name})`;
  const toIssue = (input: unknown, err: ESchemaError) =>
    new SchemaIssue.InvalidValue(Option.some(input), { message: err.message });
  const surrogate = Schema.declare<unknown>(
    (_input: unknown): _input is unknown => true,
    {
      toCodec: () =>
        Schema.link<unknown>()(eschema.schema, {
          decode: SchemaGetter.passthrough({ strict: false }),
          encode: SchemaGetter.passthrough({ strict: false }),
        }),
    },
  );
  return surrogate
    .pipe(
      Schema.decodeTo(Schema.Unknown, {
        decode: SchemaGetter.transformOrFail((input: unknown) =>
          eschema
            .decode(input)
            .pipe(Effect.mapError((err) => toIssue(input, err))),
        ),
        encode: SchemaGetter.transformOrFail((input: unknown) =>
          eschema
            .encode(input as never)
            .pipe(Effect.mapError((err) => toIssue(input, err))),
        ),
      }),
    )
    .annotate({ identifier });
}
