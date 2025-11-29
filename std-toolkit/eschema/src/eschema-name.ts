import { ESchema, EmptyESchema } from './eschema.js';
import { EmptyEvolution, Schema } from './types.js';
import { extendSchema } from './utils.js';

export type EmptyESchemaWithName = ESchemaWithName<string, EmptyEvolution[]>;

export class ESchemaWithName<
  TName extends string,
  TEvolutions extends EmptyEvolution[],
> extends ESchema<TEvolutions> {
  constructor(
    public name: TName,
    evolutions: TEvolutions,
  ) {
    super(evolutions);
  }

  static make<N extends string, S extends EmptyESchema>(
    name: N,
    eschema: S,
  ): S extends ESchema<infer TEvs extends EmptyEvolution[]>
    ? ESchemaWithName<N, TEvs>
    : never {
    return new ESchemaWithName(name, (eschema as any).evolutions) as any;
  }

  override extend<S extends Schema>(schema: S) {
    return new ESchemaWithName(
      this.name,
      extendSchema<TEvolutions, S>(this.evolutions, schema),
    );
  }
}

export const makeESchemaWithName = ESchemaWithName.make;
