import type {
  DraftDefinition,
  Evolution,
  StructFieldsSchema,
} from '../domain/schema-model/index.js';
import { DraftedESchema } from './drafted-eschema.js';

/**
 * Terminal builder returned by `.draft(...)`. It exposes only `.build()` —
 * no further `.evolve()` or `.draft()` — so a schema can carry at most one
 * draft, enforced at compile time rather than checked at runtime.
 */
export class DraftedESchemaBuilder<
  TName extends string,
  TVersion extends string,
  TLatest extends StructFieldsSchema,
  TDraft extends StructFieldsSchema,
> {
  constructor(
    private readonly name: TName,
    private readonly evolutions: readonly Evolution[],
    private readonly version: TVersion,
    private readonly draft: DraftDefinition,
  ) {}

  build(): DraftedESchema<TVersion, TLatest, TDraft, TName> {
    return DraftedESchema.internalMake<TVersion, TLatest, TDraft, TName>(
      this.name,
      this.version,
      this.evolutions,
      this.draft,
    );
  }
}
