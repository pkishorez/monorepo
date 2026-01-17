import {
  AnyInputSchema,
  InputSchemaType,
  NextVersion,
  Prettify,
} from "./types";
import { invariant } from "./utils";
import { parseMeta, parseSchema } from "./schema";

export class ESchema<TLatest extends AnyInputSchema> {
  static make<I extends AnyInputSchema>(schema: I) {
    return new Builder<"v1", I>([
      {
        version: "v1",
        schema,
        migration: null,
      },
    ]);
  }

  constructor(
    private evolutions: {
      version: string;
      schema: AnyInputSchema;
      migration: ((prev: any) => any) | null;
    }[] = [],
  ) {}

  make(value: InputSchemaType<TLatest>) {
    const evolution = this.evolutions.at(-1);
    invariant(!!evolution, "No evolutions found");

    return {
      _v: evolution.version,
      ...value,
    };
  }

  makePartial(value: Partial<InputSchemaType<TLatest>>) {
    return value;
  }

  get schema() {
    return this.evolutions.at(-1)?.schema as TLatest;
  }

  parse(value: unknown): Prettify<InputSchemaType<TLatest>> {
    const { _v } = parseMeta(value);
    const index = this.evolutions.findIndex((v) => v.version === _v);
    const evolution = this.evolutions[index];

    invariant(index !== -1 && !!evolution, `Unknown schema version: ${_v}`);

    if (index === -1) {
      throw new Error(`Unknown schema version: ${_v}`);
    }
    let prev: any = parseSchema(evolution.schema, value);
    for (let i = index; i < this.evolutions.length; i++) {
      const evolution = this.evolutions[i];
      invariant(!!evolution, "Migration not found");

      const { migration } = evolution;
      prev = migration?.(prev) ?? prev;
    }

    return prev as InputSchemaType<TLatest>;
  }
}

class Builder<TVersion extends string, TLatest extends AnyInputSchema> {
  constructor(
    private migrations: {
      version: string;
      schema: AnyInputSchema;
      migration: ((prev: any) => any) | null;
    }[],
  ) {}

  evolve<V extends NextVersion<TVersion>, N extends AnyInputSchema>(
    version: V,
    schema: N,
    migration: (prev: InputSchemaType<TLatest>) => InputSchemaType<N>,
  ) {
    return new Builder<V, N>([
      ...this.migrations,
      {
        version,
        schema,
        migration,
      },
    ]);
  }

  build() {
    return new ESchema<TLatest>(this.migrations);
  }
}
