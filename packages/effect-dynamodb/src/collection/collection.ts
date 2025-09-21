import type { EmptyESchema, ESchema } from '@monorepo/eschema';
import type {
  ExtendLatestEvolutionSchema,
  ExtractESchemaType,
} from '@monorepo/eschema/types.js';
import type { Simplify } from 'type-fest';
import { Schema } from 'effect';

const extendSchema = Schema.Struct({
  __m: Schema.String,
});
export class DynamoCollection<TSchema extends EmptyESchema> {
  eschema: TSchema;

  private constructor(eschema: TSchema) {
    this.eschema = eschema;
  }

  get upsertSchema() {
    return this.eschema.schema as Schema.Schema<
      Simplify<
        Omit<ExtractESchemaType<TSchema>, keyof typeof extendSchema.Type>
      >
    >;
  }

  get querySchema() {
    return this.eschema.schema as Schema.Schema<
      Simplify<ExtractESchemaType<TSchema>>
    >;
  }

  static make<TMakeSchema extends EmptyESchema>(eschema: TMakeSchema) {
    const extended = eschema.extend(extendSchema);

    return new DynamoCollection(extended) as DynamoCollection<
      ESchema<ExtendLatestEvolutionSchema<TMakeSchema, typeof extendSchema>>
    >;
  }
}
