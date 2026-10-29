import { Context, Schema } from 'effect';
import type { Effect } from 'effect';
import { AttachmentSchema } from '@kestack/connect/code';
import type { Gone } from '../../../../../store/rows/index.ts';

/*
 * Saved Drafts: the Draft as it shows, kept on this device for each
 * Session, and for each Project's new session, so a reload or a return
 * finds it as it was left. Local storage, in the `drafts` table of its
 * Connection's database, so it goes with its Connection and with its Account;
 * never synced, and the last save wins. What the whole device keeps, such
 * as Vim Mode, is Preferences, not here. The root page Provides it,
 * from `store.ts`.
 */

/** Where a Saved Draft belongs: a Session of a Connection, or, with none, the Project's new session. */
export interface Place {
  readonly connectionId: string;
  readonly projectId: string;
  readonly sessionId: string | null;
}

/** One Draft Mode's text, and its cursor or selection, from `anchor` to `head`. */
export const Written = Schema.Struct({
  text: Schema.String,
  anchor: Schema.Finite,
  head: Schema.Finite,
});
export type Written = typeof Written.Type;

/** A file on a Message, as it is sent, with its size to show. */
const Attached = Schema.Struct({
  ...AttachmentSchema.fields,
  size: Schema.Finite,
});

/**
 * A Saved Draft: the Draft Mode open; each mode's text and selection, by
 * mode; the Message's files, as they are sent, with their sizes; the
 * agent, model and settings picked, null where none was; and, for a new
 * session, the branch picked and whether it runs in a new Worktree, kept
 * only once picked.
 */
export const SavedDraft = Schema.Struct({
  mode: Schema.String,
  written: Schema.Record(Schema.String, Written),
  attachments: Schema.Array(Attached),
  chosen: Schema.Struct({
    account: Schema.NullOr(Schema.String),
    model: Schema.NullOr(Schema.String),
    settings: Schema.Record(Schema.String, Schema.String),
  }),
  branch: Schema.optionalKey(Schema.String),
  newWorktree: Schema.optionalKey(Schema.Boolean),
});
export type SavedDraft = typeof SavedDraft.Type;

/** The Capability that keeps each place's Saved Draft, for the Account named. */
export class SavedDrafts extends Context.Service<
  SavedDrafts,
  {
    /** The place's Saved Draft; null when none is kept, or none can be read. */
    readonly read: (
      accountId: string,
      place: Place,
    ) => Effect.Effect<SavedDraft | null>;
    /**
     * Saves the place's Saved Draft as `draft`, or deletes it for null.
     * `at` is when the draft was read, on this tab's monotonic clock: a
     * save read before one already made of the place is dropped. Saves of
     * a place are made one at a time, and each is finished even once the
     * caller goes. `since` is when the caller began saving: once its place
     * has been dropped after that, it saves the place no more. Says whether
     * it was made.
     */
    readonly save: (
      accountId: string,
      place: Place,
      draft: SavedDraft | null,
      at: bigint,
      since: bigint,
    ) => Effect.Effect<boolean>;
    /**
     * Deletes every Saved Draft of a Project removed, and stops the saves
     * of what went begun before; a Connection's go with its database.
     */
    readonly drop: (gone: Gone) => Effect.Effect<void>;
  }
>()('code/SavedDrafts') {}
