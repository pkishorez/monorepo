import { Context, Schema } from 'effect';
import type { Effect, Stream } from 'effect';
import type { DatabaseError } from '@kestack/std-toolkit/db';
import type { Gone } from '../../../../../store/rows/index.ts';

/*
 * The Unseen marks: local storage, in the `seen` table of each Machine's
 * database, so they go with their Machine, and with its Account. A mark
 * is a Session of the Machine with the end time of the last Turn seen on
 * this device. A Session is Unseen when its last Turn ended after that;
 * one never opened here has no mark, and is never Unseen. Each Machine
 * Actor reads its own and says them through `Machines`. The root page
 * Provides it, from `store.ts`.
 */

/** One Machine's Unseen marks, by Session id. */
export const Marks = Schema.Record(Schema.String, Schema.Finite);
export type Marks = typeof Marks.Type;

/** The Capability that reads and writes each Machine's Unseen marks, and says when they changed. */
export class Seen extends Context.Service<
  Seen,
  {
    /** The Machine's marks. */
    readonly read: (
      accountId: string,
      machineId: string,
    ) => Effect.Effect<Marks, DatabaseError>;
    /** Marks the Session seen up to `seen`, best effort; a mark only moves forward. */
    readonly mark: (
      accountId: string,
      machineId: string,
      projectId: string,
      sessionId: string,
      seen: number,
    ) => Effect.Effect<void>;
    /** Once per write to the Machine's marks, here or in another tab; rings while busy fold into one. */
    readonly changes: (
      accountId: string,
      machineId: string,
    ) => Stream.Stream<void>;
    /** Deletes the marks of a Project removed, best effort; a Machine's go with its database. */
    readonly drop: (gone: Gone) => Effect.Effect<void>;
  }
>()('code/Seen') {}
