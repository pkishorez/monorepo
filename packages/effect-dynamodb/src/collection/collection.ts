import type { EmptyESchema, ESchema } from '@monorepo/eschema';
import { Schema } from 'effect';

export class DynamoCollection<
  TSchema extends EmptyESchema,
  TItemSchema extends Schema.Schema<any>,
> {
  readonly itemSchema: TItemSchema;
  readonly eschema: TSchema;

  private constructor(eschema: TSchema, itemSchema: TItemSchema) {
    this.eschema = eschema;
    this.itemSchema = itemSchema;
  }

  static make<TMakeSchema extends EmptyESchema>(eschema: TMakeSchema) {
    return {
      itemSchema<T>(itemSchema: Schema.Schema<T>) {
        return {
          build() {
            return new DynamoCollection(
              eschema,
              itemSchema,
            ) as DynamoCollection<TMakeSchema, Schema.Schema<T>>;
          },
        };
      },
      build: () =>
        new DynamoCollection(eschema, eschema.schema) as DynamoCollection<
          TMakeSchema,
          TMakeSchema['schema']
        >,
    };
  }
}
