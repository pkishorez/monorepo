import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Effect, Schema } from "effect";
import {
  ForbidUnderscorePrefix,
  NextVersion,
  Prettify,
  StructFieldsDecoded,
  StructFieldsEncoded,
  StructFieldsSchema,
} from "./types";
import { ESchemaError } from "./utils";
import { struct, metaSchema } from "./schema";

export class ESchema<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> implements StandardSchemaV1<unknown, Prettify<StructFieldsDecoded<TLatest>>> {
  static make<N extends string, I extends StructFieldsSchema>(
    name: N,
    schema: I & ForbidUnderscorePrefix<I>,
  ) {
    return new Builder<N, "v1", I>(
      name,
      [
        {
          version: "v1",
          schema,
          migration: null,
        },
      ],
      "v1",
    );
  }

  constructor(
    readonly name: TName,
    private latestVersion: TVersion,
    private evolutions: {
      version: string;
      schema: StructFieldsSchema;
      migration: ((prev: any) => any) | null;
    }[] = [],
  ) {}

  makePartial(value: Partial<StructFieldsDecoded<TLatest>>) {
    return {
      ...value,
      _v: this.latestVersion,
    };
  }

  Type = null as unknown as Prettify<StructFieldsDecoded<TLatest>>;
  get schema(): TLatest {
    return this.evolutions.at(-1)?.schema as TLatest;
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
    Prettify<StructFieldsEncoded<TLatest> & { _v: TVersion }>,
    ESchemaError,
    never
  > {
    return Effect.gen(this, function* () {
      const evolution = this.evolutions.at(-1);
      if (!evolution) {
        return yield* new ESchemaError({ message: "No evolutions found" });
      }

      const data = yield* Schema.encode(struct(this.schema))(value).pipe(
        Effect.mapError(
          (error) =>
            new ESchemaError({ message: "Encode failed", cause: error }),
        ),
      );

      return {
        ...data,
        _v: this.latestVersion,
      };
    });
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
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private name: TName,
    private migrations: {
      version: string;
      schema: StructFieldsSchema;
      migration: ((prev: any) => any) | null;
    }[],
    readonly version: TVersion,
  ) {}

  evolve<V extends NextVersion<TVersion>, N extends StructFieldsSchema>(
    version: V,
    schema: N & ForbidUnderscorePrefix<N>,
    migration: (prev: StructFieldsDecoded<TLatest>) => StructFieldsDecoded<N>,
  ) {
    return new Builder<TName, V, N>(
      this.name,
      [
        ...this.migrations,
        {
          version,
          schema,
          migration,
        },
      ],
      version,
    );
  }

  build() {
    return new ESchema<TName, TVersion, TLatest>(
      this.name,
      this.version,
      this.migrations,
    );
  }
}
