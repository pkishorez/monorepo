import { Schema } from 'effect';
import type { Tagged } from './instance.ts';

/*
 * The Schemas an Actor is defined with, as written: a whole Schema, or only
 * what it is made of. A struct is its fields, `{ draft: Schema.String }`; a
 * tagged union is the fields of each case, by tag, `{ Added: {}, Removed:
 * { id: Schema.String } }`, as `Schema.TaggedUnion` takes them. Either way
 * the Actor is defined with the Schema they make.
 */

/** A Schema Kabuki can read and write without Capabilities and at once. */
export type Codec<T> = Schema.Codec<T, unknown, never, never>;

/** The fields of a struct, each a Schema. */
export type Fields = Schema.Struct.Fields;

/** The fields of each case of a tagged union, by tag. */
export type Cases = { readonly [tag: string]: Fields };

/** A struct as written: its Schema, or its fields. */
export type StructWritten = Codec<any> | Fields;

/** A tagged union as written: its Schema, or its cases. */
export type TaggedWritten = Codec<any> | Cases;

/** The type of the struct `W` writes. */
export type StructOf<W> = W extends Schema.Top
  ? W['Type']
  : W extends Fields
    ? Schema.Struct<W>['Type']
    : never;

/** The type of the tagged union `W` writes; never unless every case is tagged. */
export type TaggedOf<W> = (
  W extends Schema.Top
    ? W['Type']
    : W extends Cases
      ? {
          [K in keyof W & string]: Schema.TaggedStruct<K, W[K]>['Type'];
        }[keyof W & string]
      : never
) extends infer T extends Tagged
  ? T
  : never;

/** The Schema of a struct as written. */
export const structOf = (
  written: StructWritten | undefined,
): Codec<unknown> | undefined =>
  written === undefined || Schema.isSchema(written)
    ? (written as Codec<unknown> | undefined)
    : (Schema.Struct(written) as unknown as Codec<unknown>);

/** The Schema of a tagged union as written. */
export const taggedOf = (
  written: TaggedWritten | undefined,
): Codec<Tagged> | undefined =>
  written === undefined || Schema.isSchema(written)
    ? (written as Codec<Tagged> | undefined)
    : (Schema.TaggedUnion(written) as unknown as Codec<Tagged>);
