import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Effect } from "effect";
import {
  ESchemaResult,
  ForbidUnderscorePrefix,
  NextVersion,
  Prettify,
  StructFieldsDecoded,
  StructFieldsEncoded,
  StructFieldsSchema,
} from "./types";
import { ESchemaError } from "./utils";
import { parseMeta, decodeStruct, encodeStruct } from "./schema";

export class ESchema<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> implements StandardSchemaV1<
  unknown,
  Prettify<StructFieldsDecoded<TLatest> & { _v: TVersion; _e: TName }>
> {
  static make<N extends string, I extends StructFieldsSchema>(
    name: N,
    schema: I & ForbidUnderscorePrefix<I>,
  ) {
    return new Builder<N, "v1", I>(name, [
      {
        version: "v1",
        schema,
        migration: null,
      },
    ]);
  }

  constructor(
    readonly name: TName,
    private evolutions: {
      version: string;
      schema: StructFieldsSchema;
      migration: ((prev: any) => any) | null;
    }[] = [],
  ) {}

  makePartial(value: Partial<StructFieldsDecoded<TLatest>>) {
    return value;
  }

  get schema(): TLatest {
    return this.evolutions.at(-1)?.schema as TLatest;
  }

  decode(
    value: unknown,
  ): Effect.Effect<
    ESchemaResult<TName, TVersion, StructFieldsDecoded<TLatest>>,
    ESchemaError
  > {
    return Effect.gen(this, function* () {
      const { _v } = yield* parseMeta(value);
      const index = this.evolutions.findIndex((v) => v.version === _v);
      const evolution = this.evolutions[index];

      if (index === -1 || !evolution) {
        return yield* new ESchemaError({
          message: `Unknown schema version: ${_v}`,
        });
      }

      let data: any = yield* decodeStruct(evolution.schema, value);

      for (let i = index + 1; i < this.evolutions.length; i++) {
        const evo = this.evolutions[i];
        if (!evo) {
          return yield* new ESchemaError({ message: "Migration not found" });
        }
        data = evo.migration!(data);
      }

      const latestEvolution = this.evolutions.at(-1);
      return {
        data: data as StructFieldsDecoded<TLatest>,
        meta: { _v: latestEvolution!.version as TVersion, _e: this.name },
      };
    });
  }

  encode(
    value: StructFieldsDecoded<TLatest>,
  ): Effect.Effect<
    ESchemaResult<TName, TVersion, StructFieldsEncoded<TLatest>>,
    ESchemaError
  > {
    return Effect.gen(this, function* () {
      const evolution = this.evolutions.at(-1);
      if (!evolution) {
        return yield* new ESchemaError({ message: "No evolutions found" });
      }

      const { _v, _e, ...rest } = value as any;
      const data = yield* encodeStruct(evolution.schema as any, rest);

      return {
        data: data as StructFieldsEncoded<TLatest>,
        meta: { _v: evolution.version as TVersion, _e: this.name },
      };
    });
  }

  Type = null as unknown as Prettify<StructFieldsDecoded<TLatest>>;

  get "~standard"(): StandardSchemaV1.Props<
    unknown,
    Prettify<StructFieldsDecoded<TLatest> & { _v: TVersion; _e: TName }>
  > {
    return {
      version: 1,
      vendor: "@std-toolkit/eschema",
      validate: (value) => {
        const result = Effect.runSyncExit(this.decode(value));
        if (result._tag === "Success") {
          const { data, meta } = result.value;
          return { value: { ...data, ...meta } as any };
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
  ) {}

  evolve<V extends NextVersion<TVersion>, N extends StructFieldsSchema>(
    version: V,
    schema: N & ForbidUnderscorePrefix<N>,
    migration: (prev: StructFieldsDecoded<TLatest>) => StructFieldsDecoded<N>,
  ) {
    return new Builder<TName, V, N>(this.name, [
      ...this.migrations,
      {
        version,
        schema,
        migration,
      },
    ]);
  }

  build() {
    return new ESchema<TName, TVersion, TLatest>(this.name, this.migrations);
  }
}
