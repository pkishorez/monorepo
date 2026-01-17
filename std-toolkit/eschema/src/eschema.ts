import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Effect } from "effect";
import {
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
    private name: TName,
    private evolutions: {
      version: string;
      schema: StructFieldsSchema;
      migration: ((prev: any) => any) | null;
    }[] = [],
  ) {}

  makePartial(value: Partial<StructFieldsDecoded<TLatest>>) {
    return value;
  }

  get schema() {
    return this.evolutions.at(-1)?.schema as TLatest;
  }

  decode(
    value: unknown,
  ): Effect.Effect<
    Prettify<StructFieldsDecoded<TLatest> & { _v: TVersion; _e: TName }>,
    ESchemaError
  > {
    return Effect.gen(this, function* () {
      const { _v } = yield* parseMeta(value);
      const index = this.evolutions.findIndex((v) => v.version === _v);
      const evolution = this.evolutions[index];

      if (index === -1 || !evolution) {
        return yield* new ESchemaError({ message: `Unknown schema version: ${_v}` });
      }

      let prev: any = yield* decodeStruct(evolution.schema, value);

      for (let i = index + 1; i < this.evolutions.length; i++) {
        const evo = this.evolutions[i];
        if (!evo) {
          return yield* new ESchemaError({ message: "Migration not found" });
        }
        prev = evo.migration!(prev);
      }

      const latestEvolution = this.evolutions.at(-1);
      return {
        _v: latestEvolution!.version,
        _e: this.name,
        ...prev,
      };
    });
  }

  encode(
    value: StructFieldsDecoded<TLatest>,
  ): Effect.Effect<
    Prettify<StructFieldsEncoded<TLatest> & { _v: TVersion; _e: TName }>,
    ESchemaError
  > {
    return Effect.gen(this, function* () {
      const evolution = this.evolutions.at(-1);
      if (!evolution) {
        return yield* new ESchemaError({ message: "No evolutions found" });
      }

      const { _v, _e, ...rest } = value as any;
      const encoded = yield* encodeStruct(evolution.schema as any, rest);

      return {
        _v: evolution.version,
        _e: this.name,
        ...encoded,
      } as any;
    });
  }

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
          return { value: result.value };
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
