import type { EmptyESchema } from '@monorepo/eschema';
import { Schema } from 'effect';
import { Simplify } from 'effect/Types';

export class ItemCollection<
  TSchema extends EmptyESchema,
  TItemSchema extends Schema.Schema<any, any, never>,
  TKey extends keyof Schema.Schema.Type<TItemSchema>,
> {
  readonly itemSchema: TItemSchema;
  readonly key: TKey;
  readonly eschema: TSchema;

  private constructor({
    eschema,
    itemSchema,
    key,
  }: {
    eschema: TSchema;
    itemSchema: TItemSchema;
    key: TKey;
  }) {
    this.eschema = eschema;
    this.itemSchema = itemSchema;
    this.key = key;
  }

  get broadcastSchema() {
    const insert = this.itemSchema;
    const update = Schema.partial(
      this.itemSchema.pipe(Schema.omit(this.key)),
    ).pipe(
      Schema.extend(this.itemSchema.pipe(Schema.pick(this.key))),
    ) as any as Schema.Schema<
      Simplify<
        Partial<Omit<Schema.Schema.Type<TItemSchema>, TKey>> &
          Pick<Schema.Schema.Type<TItemSchema>, TKey>
      >
    >;

    return {
      insert,
      update,

      all: Schema.Union(
        Schema.Struct({
          type: Schema.Literal('update'),
          value: update,
        }),
        Schema.Struct({
          type: Schema.Literal('insert'),
          value: insert,
        }),
      ),
    };
  }

  static make<TMakeSchema extends EmptyESchema>(eschema: TMakeSchema) {
    return {
      itemSchema<T, I = T>(itemSchema: Schema.Schema<T, I, never>) {
        return {
          key<Key extends keyof T>(key: Key) {
            return {
              build() {
                return new ItemCollection({
                  eschema,
                  itemSchema,
                  key,
                }) as ItemCollection<
                  TMakeSchema,
                  Schema.Schema<T, I, never>,
                  Key
                >;
              },
            };
          },
        };
      },
    };
  }
}
