import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Brand, Effect, JSONSchema, Schema } from "effect";
import {
  BrandedIdSchema,
  DeltaSchema,
  ESchemaDescriptor,
  ForbidUnderscorePrefix,
  ForbidIdField,
  MergeSchemas,
  NextVersion,
  Prettify,
  StructFieldsDecoded,
  StructFieldsSchema,
} from "./types";
import { ESchemaError } from "./utils";
import { struct, metaSchema, brandedString } from "./schema";

export class ESchema<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> implements StandardSchemaV1<unknown, Prettify<StructFieldsDecoded<TLatest>>> {
  /**
   * Creates a new ESchema with the given name, ID field, and schema.
   * The ID field is automatically added to the schema as a String field.
   * It cannot be included in the user-provided schema.
   *
   * @param name - The entity name
   * @param idField - The name of the ID field (e.g., "id", "userId")
   * @param schema - The schema fields (must NOT include the ID field)
   */
  static make<
    N extends string,
    Id extends string,
    I extends StructFieldsSchema,
  >(
    name: N,
    idField: Id,
    schema: I & ForbidUnderscorePrefix<I> & ForbidIdField<I, Id>,
  ) {
    // Create the branded ID schema for this entity
    // Cast to BrandedIdSchema so both Type and Encoded are branded for type safety
    const idSchema = brandedString(
      `${name}Id`,
    ) as unknown as BrandedIdSchema<N>;

    // Add the ID field to the schema at runtime
    const schemaWithId = {
      ...schema,
      [idField]: idSchema,
    } as I & Record<Id, BrandedIdSchema<N>>;

    return new Builder<N, Id, "v1", I & Record<Id, BrandedIdSchema<N>>>(
      name,
      idField,
      idSchema,
      [
        {
          version: "v1",
          schema: schemaWithId,
          migration: null,
        },
      ],
      "v1",
    );
  }

  constructor(
    readonly name: TName,
    readonly idField: TIdField,
    readonly latestVersion: TVersion,
    private evolutions: {
      version: string;
      schema: StructFieldsSchema;
      migration: ((prev: any) => any) | null;
    }[] = [],
  ) {}

  /**
   * Creates a branded ID for this entity from a plain string.
   * Use this to create type-safe IDs for encode operations.
   */
  makeId(id: string): string & Brand.Brand<`${TName}Id`> {
    return id as string & Brand.Brand<`${TName}Id`>;
  }

  makePartial(value: Partial<StructFieldsDecoded<TLatest>>) {
    return {
      ...value,
      _v: this.latestVersion,
    };
  }

  /**
   * The type for this schema (includes branded ID).
   * Same type for both encode and decode operations.
   */
  Type = null as unknown as Prettify<StructFieldsDecoded<TLatest>>;

  /**
   * Returns the raw field definitions for the latest schema version.
   */
  get fields(): TLatest {
    return this.evolutions.at(-1)?.schema as TLatest;
  }

  /**
   * Returns the Effect Schema for this entity.
   * The type includes the branded ID.
   */
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

      return {
        ...data,
      } as StructFieldsDecoded<TLatest>;
    });
  }

  encode(
    value: StructFieldsDecoded<TLatest>,
  ): Effect.Effect<
    Prettify<StructFieldsDecoded<TLatest>>,
    ESchemaError,
    never
  > {
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

      // Add _v at runtime for versioning (not in type)
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
        return {
          issues: [{ message: cause.error.message }],
        };
      }
      return {
        issues: [{ message: "Unknown error" }],
      };
    },
  };
}

class Builder<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private name: TName,
    private _idField: TIdField,
    private _idSchema: BrandedIdSchema<TName>,
    private migrations: {
      version: string;
      schema: StructFieldsSchema;
      migration: ((prev: any) => any) | null;
    }[],
    readonly version: TVersion,
  ) {}

  /**
   * Evolves the schema to a new version with field changes.
   * The delta schema must NOT include the ID field - it is inherited automatically.
   *
   * @param version - The new version (e.g., "v2")
   * @param delta - Fields to add/modify/remove (null removes a field)
   * @param migration - Function to migrate data from previous version
   */
  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D> & ForbidIdField<D, TIdField>,
    migration: (
      prev: StructFieldsDecoded<TLatest>,
    ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>,
  ) {
    // Build the merged schema at runtime
    const prevSchema = this.migrations.at(-1)?.schema ?? {};
    const mergedSchema: StructFieldsSchema = { ...prevSchema };

    for (const [key, value] of Object.entries(delta)) {
      if (value === null) {
        delete mergedSchema[key];
      } else {
        mergedSchema[key] = value;
      }
    }

    // Ensure ID field is always present with branded type
    mergedSchema[this._idField] = this._idSchema;

    return new Builder<
      TName,
      TIdField,
      V,
      MergeSchemas<TLatest, D> & Record<TIdField, BrandedIdSchema<TName>>
    >(
      this.name,
      this._idField,
      this._idSchema,
      [
        ...this.migrations,
        {
          version,
          schema: mergedSchema,
          migration,
        },
      ],
      version,
    );
  }

  build() {
    return new ESchema<TName, TIdField, TVersion, TLatest>(
      this.name,
      this._idField,
      this.version,
      this.migrations,
    );
  }
}
