import { Context, Schema } from 'effect';
import type { Effect, Stream } from 'effect';
import type { DatabaseError } from '@kestack/std-toolkit/db';
import type { Gone } from '../../../../../store/rows/index.ts';

/*
 * The Unseen marks: local storage, in the `seen` table of each Connection's
 * database, so they go with their Connection, and with its Account. A mark
 * is a Session of the Connection with the end time of the last Turn seen on
 * this device. A Session is Unseen when its last Turn ended after that;
 * one never opened here has no mark, and is never Unseen. Each Connection
 * Actor reads its own and says them through `Connections`. The root page
 * Provides it, from `store.ts`.
 */

/** One Connection's Unseen marks, by Session id. */
export const Marks = Schema.Record(Schema.String, Schema.Finite);
export type Marks = typeof Marks.Type;

/** The Capability that reads and writes each Connection's Unseen marks, and says when they changed. */
export class Seen extends Context.Service<
  Seen,
  {
    /** The Connection's marks. */
    readonly read: (
      accountId: string,
      connectionId: string,
    ) => Effect.Effect<Marks, DatabaseError>;
    /** Marks the Session seen up to `seen`, best effort; a mark only moves forward. */
    readonly mark: (
      accountId: string,
      connectionId: string,
      projectId: string,
      sessionId: string,
      seen: number,
    ) => Effect.Effect<void>;
    /** Once per write to the Connection's marks, here or in another tab; rings while busy fold into one. */
    readonly changes: (
      accountId: string,
      connectionId: string,
    ) => Stream.Stream<void>;
    /** Deletes the marks of a Project removed, best effort; a Connection's go with its database. */
    readonly drop: (gone: Gone) => Effect.Effect<void>;
  }
>()('code/Seen') {}
