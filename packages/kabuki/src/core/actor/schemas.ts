import { Schema } from 'effect';
import type { Tagged } from './definition/index.ts';

/*
 * The Schemas an Actor is defined with, as written: a whole Schema, or only
 * what it is made of. A struct is its fields, `{ draft: Schema.String }`; a
 * tagged union is each case by tag, `{ Added: {}, Removed: { id:
 * Schema.String } }`, as its fields or as a `Schema.Struct` of them, which
 * may be annotated: `Removed: Schema.Struct({ id }).annotate({ description
 * })`. Each case is tagged with its key and keeps its annotations and
 * checks. Either way the Actor is defined with the Schema they make.
 */

/** A Schema Kabuki can read and write without Capabilities and at once. */
export type Codec<T> = Schema.Codec<T, unknown, never, never>;

/** The fields of a struct, each a Schema. */
export type Fields = Schema.Struct.Fields;

/** One case of a tagged union as written: its fields, or a struct of them. */
export type Case = Fields | Schema.Struct<Fields>;

/** Each case of a tagged union, by tag. */
export type Cases = { readonly [tag: string]: Case };

/** The fields of a case as written. */
type FieldsOf<C> = C extends Schema.Struct<infer F> ? F : C;

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
          [K in keyof W & string]: Schema.TaggedStruct<
            K,
            FieldsOf<W[K]>
          >['Type'];
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
    : (Schema.Union(
        Object.entries(written).map(([tag, written]) => caseOf(tag, written)),
      ).pipe(Schema.toTaggedUnion('_tag')) as unknown as Codec<Tagged>);

/** One case, tagged with its key: a struct keeps its annotations and checks. */
const caseOf = (tag: string, written: Case): Codec<Tagged> => {
  if (!Schema.isSchema(written))
    return Schema.TaggedStruct(tag, written) as unknown as Codec<Tagged>;
  if (!('fields' in written))
    throw new Error(
      `[@kestack/kabuki] the case ${JSON.stringify(tag)} is written as its fields or a \`Schema.Struct\` of them`,
    );
  const tagged = written.mapFields(
    (fields) => ({ _tag: Schema.tag(tag), ...fields }),
    { unsafePreserveChecks: true },
  );
  const { annotations } = written.ast;
  return (annotations
    ? tagged.annotate(annotations)
    : tagged) as unknown as Codec<Tagged>;
};
