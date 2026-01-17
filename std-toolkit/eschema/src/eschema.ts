import {
  ForbidUnderscorePrefix,
  NextVersion,
  Prettify,
  StructType,
} from "./types";
import { invariant } from "./utils";
import { parseMeta, decodeSchema, encodeSchema } from "./schema";
import { Schema } from "effect";

export class ESchema<
  TName extends string,
  TVersion extends string,
  TLatest extends StructType,
> {
  static make<N extends string, I extends StructType>(
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
      schema: StructType;
      migration: ((prev: any) => any) | null;
    }[] = [],
  ) {}

  makePartial(value: Partial<Schema.Schema.Type<TLatest>>) {
    return value;
  }

  get schema() {
    return this.evolutions.at(-1)?.schema as TLatest;
  }

  decode(value: unknown): Prettify<Schema.Schema.Type<TLatest>> {
    const { _v } = parseMeta(value);
    const index = this.evolutions.findIndex((v) => v.version === _v);
    const evolution = this.evolutions[index];

    invariant(index !== -1 && !!evolution, `Unknown schema version: ${_v}`);

    let prev: any = decodeSchema(evolution.schema, value);
    for (let i = index; i < this.evolutions.length; i++) {
      const evolution = this.evolutions[i];
      invariant(!!evolution, "Migration not found");

      const { migration } = evolution;
      prev = migration?.(prev) ?? prev;
    }

    const latestEvolution = this.evolutions.at(-1);
    return {
      _v: latestEvolution!.version,
      _e: this.name,
      ...prev,
    };
  }

  encode(
    value: Schema.Schema.Type<Schema.Struct<TLatest>>,
  ): Prettify<
    Schema.Schema.Encoded<Schema.Struct<TLatest>> & { _v: TVersion; _e: TName }
  > {
    const evolution = this.evolutions.at(-1);
    invariant(!!evolution, "No evolutions found");

    const { _v, _e, ...rest } = value as any;
    return {
      _v: evolution.version,
      _e: this.name,
      ...encodeSchema(evolution.schema as any, rest),
    } as any;
  }
}

class Builder<
  TName extends string,
  TVersion extends string,
  TLatest extends StructType,
> {
  constructor(
    private name: TName,
    private migrations: {
      version: string;
      schema: StructType;
      migration: ((prev: any) => any) | null;
    }[],
  ) {}

  evolve<V extends NextVersion<TVersion>, N extends StructType>(
    version: V,
    schema: N & ForbidUnderscorePrefix<N>,
    migration: (
      prev: Schema.Schema.Type<Schema.Struct<TLatest>>,
    ) => Schema.Schema.Type<Schema.Struct<N>>,
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
