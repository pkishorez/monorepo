import { DistributiveOmit } from '@monorepo/effect-idb/types.js';
import type { EmptyESchema } from '@monorepo/eschema';
import { Schema } from 'effect';
import { Simplify } from 'effect/Types';

export class ItemCollection<
  TName extends string,
  TSchema extends EmptyESchema,
  TKey extends keyof TSchema['Type'],
> {
  readonly name: TName;
  readonly key: TKey;
  readonly eschema: TSchema;

  private constructor({
    name,
    eschema,
    key,
  }: {
    name: TName;
    eschema: TSchema;
    key: TKey;
  }) {
    this.name = name;
    this.eschema = eschema;
    this.key = key;
  }

  Type = null as TSchema['Type'];

  get schema() {
    return this.eschema.schema as TSchema['schema'];
  }

  get broadcastSchema() {
    return Schema.partial(this.eschema.schema.pipe(Schema.omit(this.key))).pipe(
      Schema.extend(this.eschema.schema.pipe(Schema.pick(this.key))),
    ) as any as Schema.Schema<
      Simplify<
        Partial<DistributiveOmit<TSchema['Type'], TKey>> &
          Pick<TSchema['Type'], TKey>
      >
    >;
  }

  static make<TName extends string>(name: TName) {
    return {
      eschema<TMakeSchema extends EmptyESchema>(eschema: TMakeSchema) {
        return {
          key<Key extends keyof TMakeSchema['Type']>(key: Key) {
            return {
              build() {
                return new ItemCollection({
                  name,
                  eschema,
                  key,
                }) as ItemCollection<TName, TMakeSchema, Key>;
              },
            };
          },
        };
      },
    };
  }
}
