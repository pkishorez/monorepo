import { Context, Schema } from 'effect';
import type { Effect } from 'effect';
import type { Gone } from './gone.ts';

/*
 * What the app keeps on this device of what Cloud Connect and each Machine
 * last said, so it shows at once and is asked again behind: a Machine
 * List, a Machine Kit, a Project's Skills. Nothing kept is the truth: the
 * next answer replaces it, and what went goes with it. The app Layer
 * gives it, from `services/kept/`.
 *
 * 1. Saved   the copy kept for its Account, Machine or Project shows
 *            first; read, kept or not, it says so.
 * 2. Ask     then it is asked again behind, once read, and again each
 *            time its holder says so.
 * 3. Answer  the answer to the latest ask replaces what shows, and is
 *            kept; one to an ask made before a later ask, or before a
 *            change made here, is dropped, so it never undoes the change.
 * 4. Drop    what went, as one Gone, is deleted.
 */

/** Whose a kept copy is: its Account's, and its Machine's and Project's when it has them. */
export interface Whose {
  readonly accountId: string;
  readonly machineId: string | null;
  readonly projectId: string | null;
}

/** One kind of kept copy: its name, the version of its shape, and its shape as JSON. */
export interface Shelf<A> {
  readonly name: string;
  /** A copy kept at another version reads as nothing, and is replaced by the next answer. */
  readonly version: number;
  readonly json: Schema.Codec<A, string>;
}

/** A kind of kept copy, of a shape at a version. */
export const shelf = <S extends Schema.Codec<any, any>>(
  name: string,
  version: number,
  schema: S,
): Shelf<S['Type']> => ({
  name,
  version,
  json: Schema.fromJsonString(schema) as unknown as Schema.Codec<
    S['Type'],
    string
  >,
});

/** The Capability that keeps each copy, and drops what went. */
export class Kept extends Context.Service<
  Kept,
  {
    /** 1. Saved: the copy kept; null when none is, or none can be read. */
    readonly read: <A>(
      shelf: Shelf<A>,
      whose: Whose,
    ) => Effect.Effect<A | null>;
    /** 3. Answer: keeps the copy, best effort; one begun before its owner went is not made. */
    readonly write: <A>(
      shelf: Shelf<A>,
      whose: Whose,
      value: A,
    ) => Effect.Effect<void>;
    /** 4. Drop: deletes every copy that went. */
    readonly drop: (gone: Gone) => Effect.Effect<void>;
  }
>()('code/Kept') {}

/** A kept copy as its holder's Model keeps it. */
export const Copy = <S extends Schema.Top>(value: S) =>
  Schema.Struct({
    /** What shows: the saved copy, or the latest answer; null before either. */
    value: Schema.NullOr(value),
    /** Whether the saved copy has been read, kept or not. */
    savedRead: Schema.Boolean,
    /** Which ask is the latest: each ask, and each change made here, is one more. */
    wanted: Schema.Finite,
    /** The latest ask answered, or refused. */
    answered: Schema.Finite,
    /** Why the latest ask was refused, until one is answered. */
    problem: Schema.NullOr(Schema.String),
  });

interface Held<A> {
  readonly value: A | null;
  readonly savedRead: boolean;
  readonly wanted: number;
  readonly answered: number;
  readonly problem: string | null;
}

/** How a kept copy changes, for its holder's Updates; each is pure. */
export const copy = {
  /** Nothing shown yet, and one ask wanted once the saved copy is read. */
  empty: {
    value: null,
    savedRead: false,
    wanted: 1,
    answered: 0,
    problem: null,
  } as Held<never>,
  // 1. Saved: an answer that came first is kept over it.
  saved: <A>(held: Held<A>, value: A | null): Held<A> => ({
    ...held,
    savedRead: true,
    value: held.value ?? value,
  }),
  // 2. Ask
  ask: <A>(held: Held<A>): Held<A> => ({ ...held, wanted: held.wanted + 1 }),
  /** The ask its holder's Worker runs, keyed by it: none until the saved copy is read, or once answered. */
  asking: (held: Held<unknown>): ReadonlyArray<string> =>
    held.savedRead && held.answered < held.wanted ? [String(held.wanted)] : [],
  /** A change made here: shown at once, and asked again, so an answer begun before it is dropped. */
  changed: <A>(held: Held<A>, value: A): Held<A> => ({
    ...held,
    value,
    wanted: held.wanted + 1,
  }),
  // 3. Answer
  /** Whether an answer to the ask `since` is the latest, so it shows and is kept. */
  latest: (held: Held<unknown>, since: number) => since === held.wanted,
  answered: <A>(held: Held<A>, since: number, value: A): Held<A> =>
    since === held.wanted
      ? { ...held, value, answered: since, problem: null }
      : held,
  refused: <A>(held: Held<A>, since: number, problem: string): Held<A> =>
    since === held.wanted ? { ...held, answered: since, problem } : held,
};
