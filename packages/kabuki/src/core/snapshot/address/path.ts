import type { AnyActor } from '../../actor/index.ts';

/*
 * The Address: who an Instance is and where it lives, as one path from the
 * root. The root's segment is its Actor's name; each Child's is the State it
 * is written in, if it is written in one, its slot, its key if it has one,
 * and how many times its parent has Invoked that slot and key so far:
 *
 *   App                                   the root
 *   App/Inside:downloads#2                the second `downloads` App Invoked in Inside
 *   App/Inside:downloads#2/files[3]#1     the first `files` keyed `3` under it
 *
 * So the same Messages always give the same Addresses, an Instance Invoked
 * again gets a new one, and finding an Instance walks straight down to it.
 * Without its keys and counts it is the Instance's place in the root's
 * Blueprint: `App/Inside:downloads/files`.
 */

declare const actor: unique symbol;

/** An Instance's Address, carrying its Actor's type so only its Messages can be Sent to it. */
export type Address<A = AnyActor> = string & { readonly [actor]: A };

/** One Child's segment of an Address. */
export interface Segment {
  /** The State the Child is written in; none for a Child written at the top. */
  readonly state?: string;
  readonly slot: string;
  /** Its key, decoded; none for a Child not held under a key. */
  readonly key?: string;
  /** How many times its parent had Invoked this slot and key, this one included. */
  readonly n: number;
}

/** An Address read: the root's name, and one segment per Child below it. */
export interface Parsed {
  readonly root: string;
  readonly path: ReadonlyArray<Segment>;
}

const SEGMENT =
  /^(?:([^/:[\]#]+):)?([^/:[\]#]+)(?:\[([^/[\]]*)\])?#([1-9]\d*)$/;

/** A Child's Address, under its parent's. */
export const childAddress = (
  parent: string,
  state: string | undefined,
  slot: string,
  key: string | undefined,
  n: number,
): Address =>
  `${parent}/${state === undefined ? '' : `${state}:`}${slot}${key === undefined ? '' : `[${encodeURIComponent(key)}]`}#${n}` as Address;

/** What a parent counts its Invocations of a Child under: its slot, and its key if it has one. */
export const counterOf = (slot: string, key: string | undefined): string =>
  key === undefined ? slot : `${slot}[${encodeURIComponent(key)}]`;

/** One Child's segment, read; none if it is not one. */
export const segmentOf = (text: string): Segment | undefined => {
  const found = SEGMENT.exec(text);
  if (!found) return undefined;
  const [, state, slot, key, n] = found;
  let decoded: string | undefined;
  try {
    decoded = key === undefined ? undefined : decodeURIComponent(key);
  } catch {
    return undefined;
  }
  return {
    ...(state === undefined ? {} : { state }),
    slot: slot!,
    ...(decoded === undefined ? {} : { key: decoded }),
    n: Number(n),
  };
};

/**
 * An Address read, from its end: every segment that is a Child's, and the
 * rest is the root's name, which may hold a `/` itself. None for an empty
 * root.
 */
export const parse = (address: string): Parsed | undefined => {
  const parts = address.split('/');
  const path: Array<Segment> = [];
  let end = parts.length;
  for (; end > 1; end--) {
    const segment = segmentOf(parts[end - 1]!);
    if (!segment) break;
    path.unshift(segment);
  }
  const root = parts.slice(0, end).join('/');
  return root === '' ? undefined : { root, path };
};

/** Whether `address` is `ancestor` or below it. */
export const within = (ancestor: string, address: string): boolean =>
  address.startsWith(ancestor) &&
  (address.length === ancestor.length || address[ancestor.length] === '/');

/** The segment under `parent` on the way down to `address`, if `address` is below it. */
export const segmentToward = (
  parent: string,
  address: string,
): Segment | undefined => {
  if (!address.startsWith(`${parent}/`)) return undefined;
  const rest = address.slice(parent.length + 1);
  const end = rest.indexOf('/');
  return segmentOf(end < 0 ? rest : rest.slice(0, end));
};

/** A Child's key, read from the end of its Address; none for one not held under a key. */
export const keyOf = (address: string): string | undefined =>
  segmentOf(address.slice(address.lastIndexOf('/') + 1))?.key;
