import { Context, Schema } from 'effect';
import type { Effect } from 'effect';
import type { Gone } from '../../../../store/rows/index.ts';

/*
 * The cache: what the app keeps on this device of what Cloud Connect and
 * each Connection last said, so it shows at once and is asked again behind:
 * an Account's Connection List, in the Account's database; a Connection's setup
 * and its Projects' Skills, in the Connection's. Each kind is a table there,
 * so it goes with its database. Nothing cached is the truth: the next
 * answer replaces it, and what went goes with it. The root page Provides
 * it, from `store.ts`; how a holder's Model follows its copy through
 * these steps is `copy.ts`.
 *
 * 1. Kept    the copy kept for its Account, Connection or Project shows
 *            first; read, kept or not, it says so.
 * 2. Ask     then it is asked again behind, once read, and again each
 *            time its holder says so.
 * 3. Answer  the answer to the latest ask replaces what shows, and is
 *            kept; one to an ask made before a later ask, or before a
 *            change made here, is dropped, so it never undoes the change.
 * 4. Drop    what went, as one Gone, is deleted.
 */

/** The table each kind of copy is kept in: of an Account, its Connection List; of a Connection, its setup and its Projects' Skills. */
export type Table = 'connections' | 'setup' | 'skills';

/** The tables of a Connection's database, in which a Project removed is looked for. */
export const connectionTables: ReadonlyArray<Table> = ['setup', 'skills'];

/** Whose a kept copy is: its Account's, and its Connection's and Project's when it has them; one of no Connection is kept in the Account's database. */
export interface Whose {
  readonly accountId: string;
  readonly connectionId: string | null;
  readonly projectId: string | null;
}

/** One kind of kept copy: its table, the version of its shape, and its shape as JSON. */
export interface Shelf<A> {
  readonly name: Table;
  /** A copy kept at another version reads as nothing, and is replaced by the next answer. */
  readonly version: number;
  readonly json: Schema.Codec<A, string>;
}

/** A kind of kept copy, in its table, of a shape at a version. */
export const shelf = <S extends Schema.Codec<any, any>>(
  name: Table,
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
export class Cache extends Context.Service<
  Cache,
  {
    /** 1. Kept: the copy kept; null when none is, or none can be read. */
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
>()('code/Cache') {}
