import {
  ForbidUnderscorePrefix,
  NextVersion,
  Prettify,
  StructFieldsDecoded,
  StructFieldsEncoded,
  StructFieldsSchema,
} from "./types";
import { invariant } from "./utils";
import { parseMeta, decodeStruct, encodeStruct } from "./schema";
import { Schema } from "effect";

export class ESchema<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
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

  decode(value: unknown): Prettify<StructFieldsDecoded<TLatest>> {
    const { _v } = parseMeta(value);
    const index = this.evolutions.findIndex((v) => v.version === _v);
    const evolution = this.evolutions[index];

    invariant(index !== -1 && !!evolution, `Unknown schema version: ${_v}`);

    let prev: any = decodeStruct(evolution.schema, value);
    for (let i = index + 1; i < this.evolutions.length; i++) {
      const evolution = this.evolutions[i];
      invariant(!!evolution, "Migration not found");
      prev = evolution.migration!(prev);
    }

    const latestEvolution = this.evolutions.at(-1);
    return {
      _v: latestEvolution!.version,
      _e: this.name,
      ...prev,
    };
  }

  encode(
    value: StructFieldsDecoded<TLatest>,
  ): Prettify<StructFieldsEncoded<TLatest> & { _v: TVersion; _e: TName }> {
    const evolution = this.evolutions.at(-1);
    invariant(!!evolution, "No evolutions found");

    const { _v, _e, ...rest } = value as any;
    return {
      _v: evolution.version,
      _e: this.name,
      ...encodeStruct(evolution.schema as any, rest),
    } as any;
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
