import type { AnyActor, Blueprint } from '../../actor/index.ts';
import { parse as read, within as under } from './path.ts';
import type { Address as Of, Parsed } from './path.ts';

/*
 * Reading Addresses, as plain strings: what one is made of, its parent, its
 * place in the root's Blueprint, and whether text written by hand names a
 * Child the root's Blueprint has.
 */

export type { Parsed, Segment } from './path.ts';

/** An Instance's Address, carrying its Actor's type so only its Messages can be Sent to it. */
export type Address<A = AnyActor> = Of<A>;

const parse = (address: Address<any>): Parsed => {
  const parsed = read(address);
  if (!parsed)
    throw new TypeError(`[@kestack/kabuki] ${address} is not an Address`);
  return parsed;
};

/** The parent's Address; none for the root. */
const parent = (address: Address<any>): Address | undefined =>
  parse(address).path.length === 0
    ? undefined
    : (address.slice(0, address.lastIndexOf('/')) as Address);

/** The Instance's place in the root's Blueprint: its Address without keys and counts, `App/Inside:downloads/files`. */
const place = (address: Address<any>): string => {
  const { root, path } = parse(address);
  return [
    root,
    ...path.map(({ state, slot }) =>
      state === undefined ? slot : `${state}:${slot}`,
    ),
  ].join('/');
};

/** Whether `address` is `ancestor` or below it. */
const within = (ancestor: Address<any>, address: Address<any>): boolean =>
  under(ancestor, address);

/**
 * `text` as an Address of the root's tree, if the root's Blueprint has a
 * Child at every segment: written at the top, or in the State it names,
 * with a key exactly when it is held under one. Says nothing of whether an
 * Instance is there now.
 */
const check = (root: AnyActor, text: string): Address | undefined => {
  const parsed = read(text);
  if (!parsed || parsed.root !== root.name) return undefined;
  let here: Blueprint | undefined = root.blueprint;
  for (const { state, slot, key } of parsed.path) {
    if (!here) return undefined;
    const level: Blueprint['top'] | undefined =
      state === undefined ? here.top : own(here.state, state);
    const child: Blueprint['top']['children'][string] | undefined =
      level && own(level.children, slot);
    if (!child) return undefined;
    if ((key !== undefined) !== (child.kind === 'each' || child.keyed))
      return undefined;
    here = child.blueprint;
  }
  return text as Address;
};

const own = <T>(record: Readonly<Record<string, T>>, key: string) =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** An Instance's Address: who it is and where it lives, as one path from the root. */
export const Address = { parse, parent, place, within, check };
