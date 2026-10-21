import { Schema } from 'effect';
import type { EntityMeta } from '../../core/index.js';
import type { AnyEntityESchema } from '../../eschema/index.js';

/*
 * A Replica's Definition: its name, its Key and its Collections, as shapes
 * only. It runs nothing, so a Query, an Action and a Build can all import it.
 * It also names each Instance: the Replica's name and the Key, never a place
 * in the tree, so the same Key finds the same stored data in every tab.
 */

/** A Key is written as text: an Instance is named by it, in the Store and in the tree. */
export type KeySchema<K> = Schema.Codec<K, string, never, never>;

/** The Collections of a Replica, by name, each an entity ESchema. */
export type CollectionSchemas = Readonly<Record<string, AnyEntityESchema>>;

/**
 * One row of a Collection: the Entity's latest value, its meta under
 * `_meta`. An Optimistic Change has no `_meta` until the Backend answers.
 */
export type Row<S extends AnyEntityESchema> = S['Type'] & {
  readonly _meta?: EntityMeta;
};

export interface Definition<
  Name extends string = string,
  K = any,
  C extends CollectionSchemas = CollectionSchemas,
> {
  readonly name: Name;
  readonly collections: C;
  /** The Instance's name for a Key: `pocket·acct-42`, or `pocket` with no Key. */
  readonly instanceName: (key: K) => string;
  /** The Key as text, as the tree keys an Instance by it: `''` with no Key. */
  readonly keyText: (key: K) => string;
  /** The Key back from its text. */
  readonly keyOf: (text: string) => K;
}

export type AnyDefinition = Definition<string, any, CollectionSchemas>;

/** Between a Replica's name and its Key, in an Instance's name. */
const SEPARATOR = '·';

/** An Instance's name, from the Replica's name and its Key as text. */
export const nameOf = (replica: string, keyText: string) =>
  keyText === '' ? replica : `${replica}${SEPARATOR}${keyText}`;

/** The Replica and the Key text an Instance's name was made from. */
export const partsOf = (name: string) => {
  const at = name.indexOf(SEPARATOR);
  return at === -1
    ? { replica: name, key: '' }
    : { replica: name.slice(0, at), key: name.slice(at + SEPARATOR.length) };
};

function define<const Name extends string, const C extends CollectionSchemas>(
  name: Name,
  shape: { readonly key?: never; readonly collections: C },
): Definition<Name, void, C>;
function define<
  const Name extends string,
  K,
  const C extends CollectionSchemas,
>(
  name: Name,
  shape: { readonly key: KeySchema<K>; readonly collections: C },
): Definition<Name, K, C>;
function define(
  name: string,
  shape: {
    readonly key?: KeySchema<unknown>;
    readonly collections: CollectionSchemas;
  },
): AnyDefinition {
  if (name === '' || name.includes(SEPARATOR))
    throw new Error(
      `[@kestack/std-toolkit/replica] a Replica's name must be text without "${SEPARATOR}": "${name}"`,
    );
  const { key } = shape;
  const keyText = key ? Schema.encodeSync(key) : () => '';
  const keyOf = key ? Schema.decodeSync(key) : () => undefined;
  return {
    name,
    collections: shape.collections,
    keyText,
    keyOf,
    instanceName: (value) => nameOf(name, keyText(value)),
  };
}

/** A Replica's shapes: its name, its Key, if it has one, and its Collections. */
export const Definition = { define };

export { ReplicaError } from './error.js';
