import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Effect, JSONSchema, ParseResult, Schema } from "effect";
import type {
  IdSchema,
  ESchemaDescriptor,
  Evolution,
  ForbidUnderscorePrefix,
  ForbidIdField,
  Prettify,
  StructFieldsDecoded,
  StructFieldsSchema,
} from "./types.js";
import { ESchemaError } from "./utils.js";
import { struct, metaSchema, INITIAL_VERSION } from "./schema.js";
import {
  ESchemaBuilder,
  SingleEntityESchemaBuilder,
  EntityESchemaBuilder,
} from "./internal/builders.js";

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

  get fields(): TLatest {
    const lastEvolution = this.evolutions?.at(-1);
    if (!lastEvolution?.schema) {
      throw new Error(
        `ESchema is not properly initialized. ` +
        `This usually happens when the schema is accessed before module initialization completes. ` +
        `Consider using lazy initialization or avoiding top-level schema computations.`
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
    return Effect.gen(this, function* () {
      const _v = yield* Schema.decodeUnknown(metaSchema)(value).pipe(
        Effect.map((v) => v._v),
        Effect.orElseSucceed(() => this.latestVersion),
      );
      const index = this.evolutions.findIndex((v) => v.version === _v);
      const evolution = this.evolutions[index];

      if (index === -1 || !evolution) {
        return yield* new ESchemaError({
          message: `Unknown schema version: ${_v}`,
        });
      }

      let data = yield* Schema.decodeUnknown(struct(evolution.schema))(
        value,
      ).pipe(
        Effect.tapError((err) =>
          Effect.sync(() =>
            console.error(
              `[ESchema] Decode failed for "${(this as any).name ?? "anonymous"}" (version ${_v}):\n${ParseResult.TreeFormatter.formatErrorSync(err)}`,
            ),
          ),
        ),
        Effect.mapError(
          (err) => new ESchemaError({ message: "Decode failed", cause: err }),
        ),
      );

      for (let i = index + 1; i < this.evolutions.length; i++) {
        const evo = this.evolutions[i];
        if (!evo) {
          return yield* new ESchemaError({ message: "Migration not found" });
        }
        data = evo.migration!(data);
      }

      return data as StructFieldsDecoded<TLatest>;
    });
  }

  encode(
    value: StructFieldsDecoded<TLatest>,
  ): Effect.Effect<Prettify<StructFieldsDecoded<TLatest>>, ESchemaError, never> {
    return Effect.gen(this, function* () {
      const evolution = this.evolutions.at(-1);
      if (!evolution) {
        return yield* new ESchemaError({ message: "No evolutions found" });
      }

      const data = yield* Schema.encode(struct(this.fields))(value).pipe(
        Effect.mapError(
          (error) =>
            new ESchemaError({ message: "Encode failed", cause: error }),
        ),
      );

      return {
        ...data,
        _v: this.latestVersion,
      } as unknown as StructFieldsDecoded<TLatest>;
    });
  }

  getDescriptor(): ESchemaDescriptor {
    const schemaWithVersion = Schema.Struct({
      ...this.fields,
      _v: Schema.Literal(this.latestVersion),
    });
    return JSONSchema.make(schemaWithVersion) as ESchemaDescriptor;
  }

  "~standard" = {
    version: 1 as const,
    vendor: "@std-toolkit/eschema",
    types: {
      input: null as unknown as Prettify<StructFieldsDecoded<TLatest>>,
      output: null as unknown as Prettify<StructFieldsDecoded<TLatest>>,
    },
    validate: (value: unknown) => {
      const result = Effect.runSyncExit(this.decode(value));
      if (result._tag === "Success") {
        const value = result.value;
        return { value };
      }
      const cause = result.cause;
      if (cause._tag === "Fail") {
        return { issues: [{ message: cause.error.message }] };
      }
      return { issues: [{ message: "Unknown error" }] };
    },
  };
}

export namespace ESchema {
  export function make<I extends StructFieldsSchema>(
    schema: I & ForbidUnderscorePrefix<I>,
  ) {
    return new ESchemaBuilder<"v1", I>(
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
    return new SingleEntityESchemaBuilder<N, "v1", I>(
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
    const schemaWithId = { ...schema, [idField]: idSchema } as I & Record<Id, IdSchema>;

    return new EntityESchemaBuilder<N, Id, "v1", I & Record<Id, IdSchema>>(
      name,
      idField,
      idSchema,
      [{ version: INITIAL_VERSION, schema: schemaWithId, migration: null }],
      INITIAL_VERSION,
    );
  }
}
