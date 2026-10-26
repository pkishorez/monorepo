import { Schema } from 'effect';

/*
 * A kept copy as its holder's Model holds it, and how it changes through
 * the steps of `Kept`: the kept copy read, asked again, answered or
 * refused, and changed here. Each change is pure, for the holder's
 * Updates; what it keeps, it keeps through `Kept`.
 */

/** A kept copy as its holder's Model keeps it. */
export const Copy = <S extends Schema.Top>(value: S) =>
  Schema.Struct({
    /** What shows: the kept copy, or the latest answer; null before either. */
    value: Schema.NullOr(value),
    /** Whether the kept copy has been read, kept or not. */
    keptRead: Schema.Boolean,
    /** Which ask is the latest: each ask, and each change made here, is one more. */
    wanted: Schema.Finite,
    /** The latest ask answered, or refused. */
    answered: Schema.Finite,
    /** Why the latest ask was refused, until one is answered. */
    problem: Schema.NullOr(Schema.String),
  });

interface Held<A> {
  readonly value: A | null;
  readonly keptRead: boolean;
  readonly wanted: number;
  readonly answered: number;
  readonly problem: string | null;
}

/** How a kept copy changes, for its holder's Updates; each is pure. */
export const copying = {
  /** Nothing shown yet, and one ask wanted once the kept copy is read. */
  empty: {
    value: null,
    keptRead: false,
    wanted: 1,
    answered: 0,
    problem: null,
  } as Held<never>,
  // 1. Kept: read, and shown unless an answer came first.
  read: <A>(held: Held<A>, value: A | null): Held<A> => ({
    ...held,
    keptRead: true,
    value: held.value ?? value,
  }),
  // 2. Ask
  ask: <A>(held: Held<A>): Held<A> => ({ ...held, wanted: held.wanted + 1 }),
  /** The ask its holder's Worker runs, keyed by it: none until the kept copy is read, or once answered. */
  asking: (held: Held<unknown>): ReadonlyArray<string> =>
    held.keptRead && held.answered < held.wanted ? [String(held.wanted)] : [],
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
