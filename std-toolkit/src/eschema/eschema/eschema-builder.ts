import type {
  DeltaSchema,
  Evolution,
  ForbidOptionalFields,
  ForbidUnderscorePrefix,
  MergeSchemas,
  NextVersion,
  StructFieldsDecoded,
  StructFieldsSchema,
} from '../domain/schema-model/index.js';
import { mergeDelta } from '../domain/schema-model/index.js';
import type { ESchema } from './eschema.js';
import { DraftedESchemaBuilder } from './drafted-eschema-builder.js';

export class ESchemaBuilder<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
> {
  constructor(
    private readonly name: TName,
    private readonly evolutions: readonly Evolution[],
    readonly version: TVersion,
    private readonly finish: <V extends string, S extends StructFieldsSchema>(
      version: V,
      evolutions: readonly Evolution[],
    ) => ESchema<V, S, TName>,
  ) {}

  evolve<V extends NextVersion<TVersion>, D extends DeltaSchema>(
    version: V,
    delta: D & ForbidUnderscorePrefix<D> & ForbidOptionalFields<D>,
    migration: (
      previous: StructFieldsDecoded<TLatest>,
    ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>,
  ) {
    const previous = this.evolutions.at(-1)?.schema ?? {};
    const evolutions = [
      ...this.evolutions,
      {
        version,
        schema: mergeDelta(previous, delta),
        migration,
      },
    ];
    return new ESchemaBuilder<TName, V, MergeSchemas<TLatest, D>>(
      this.name,
      evolutions,
      version,
      this.finish,
    );
  }

  draft<D extends DeltaSchema>(
    delta: D & ForbidUnderscorePrefix<D> & ForbidOptionalFields<D>,
    migrations: {
      readonly forward: (
        previous: StructFieldsDecoded<TLatest>,
      ) => StructFieldsDecoded<MergeSchemas<TLatest, D>>;
      readonly backward: (
        draft: StructFieldsDecoded<MergeSchemas<TLatest, D>>,
      ) => StructFieldsDecoded<TLatest>;
    },
  ): DraftedESchemaBuilder<TName, TVersion, TLatest, MergeSchemas<TLatest, D>> {
    const previous = this.evolutions.at(-1)?.schema ?? {};
    const schema = mergeDelta(previous, delta);
    return new DraftedESchemaBuilder<
      TName,
      TVersion,
      TLatest,
      MergeSchemas<TLatest, D>
    >(this.name, this.evolutions, this.version, {
      schema,
      forward: migrations.forward,
      backward: migrations.backward,
    });
  }

  build(): ESchema<TVersion, TLatest, TName> {
    return this.finish<TVersion, TLatest>(this.version, this.evolutions);
  }
}
