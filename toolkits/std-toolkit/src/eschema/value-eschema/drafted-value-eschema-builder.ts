import type {
  ValueDraftDefinition,
  ValueEvolution,
  ValueSchema,
} from '../domain/schema-model/index.js';
import { DraftedValueESchema } from './drafted-value-eschema.js';

/**
 * Terminal builder returned by `.draft(...)`. It exposes only `.build()` —
 * no further `.evolve()` or `.draft()` — so a schema can carry at most one
 * draft, enforced at compile time rather than checked at runtime.
 */
export class DraftedValueESchemaBuilder<
  TVersion extends string,
  TLatest extends ValueSchema,
  TDraft extends ValueSchema,
> {
  constructor(
    private readonly name: string,
    private readonly evolutions: readonly ValueEvolution[],
    private readonly version: TVersion,
    private readonly draft: ValueDraftDefinition,
  ) {}

  build(): DraftedValueESchema<TVersion, TLatest, TDraft> {
    return DraftedValueESchema.internalMake<TVersion, TLatest, TDraft>(
      this.name,
      this.version,
      this.evolutions,
      this.draft,
    );
  }
}
