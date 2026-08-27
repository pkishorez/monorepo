import type {
  DraftDefinition,
  Evolution,
  StructFieldsSchema,
} from '../domain/schema-model/index.js';
import { DraftedEntityESchema } from './drafted-entity-eschema.js';

/**
 * Terminal builder returned by `.draft(...)`. It exposes only `.build()` —
 * no further `.evolve()` or `.draft()` — so a schema can carry at most one
 * draft, enforced at compile time rather than checked at runtime.
 */
export class DraftedEntityESchemaBuilder<
  TName extends string,
  TIdField extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
  TDraft extends StructFieldsSchema,
> {
  constructor(
    private readonly name: TName,
    private readonly idField: TIdField,
    private readonly evolutions: readonly Evolution[],
    private readonly version: TVersion,
    private readonly draft: DraftDefinition,
  ) {}

  build(): DraftedEntityESchema<TName, TIdField, TVersion, TLatest, TDraft> {
    return DraftedEntityESchema.internalMake<
      TName,
      TIdField,
      TVersion,
      TLatest,
      TDraft
    >(this.name, this.idField, this.version, this.evolutions, this.draft);
  }
}
