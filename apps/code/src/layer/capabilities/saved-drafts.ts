import { Context, Schema } from 'effect';
import type { Effect } from 'effect';
import { AttachmentSchema } from '@kestack/connect/code';

/*
 * Saved Drafts: the Draft as last written, kept on this device for each
 * Session, and for each Project's new session, so a reload or a return
 * finds it as it was left. Kept per Account, never synced, and the last
 * save wins. What the whole device keeps, such as Vim Mode, is Device
 * State, not here. The app Layer gives it, from `services/saved-drafts.ts`.
 */

/** Where a Saved Draft belongs: a Session of a Machine, or, with none, the Project's new session. */
export interface Place {
  readonly machineId: string;
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
 * A Message sent and not yet answered, kept until the Machine takes it,
 * so one refused after the Draft is gone comes back. `refused`: why, once
 * it was.
 */
const Unsent = Schema.Struct({
  key: Schema.String,
  text: Schema.String,
  attachments: Schema.Array(Attached),
  refused: Schema.NullOr(Schema.String),
});

/**
 * A Saved Draft: the Draft Mode open; each mode's text and selection, by
 * mode; the Message's files, as they are sent, with their sizes; the
 * agent, model and settings picked, null where none was; and the Messages
 * sent and not yet answered.
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
  unsent: Schema.Array(Unsent),
});
export type SavedDraft = typeof SavedDraft.Type;

/** A Saved Draft as it is kept: `revision` counts its writes, whichever tab made them. */
export interface Kept {
  readonly draft: SavedDraft;
  readonly revision: number;
}

/** What goes, at once: a Project removed, a Machine forgotten or no longer listed, an Account signed out. */
export type Gone =
  | {
      readonly _tag: 'Project';
      readonly machineId: string;
      readonly projectId: string;
    }
  | {
      readonly _tag: 'Machine';
      readonly accountId: string;
      readonly machineId: string;
    }
  | {
      readonly _tag: 'Unlisted';
      readonly accountId: string;
      /** The Account's Machines still listed: every other's go. */
      readonly listed: ReadonlyArray<string>;
    }
  | {
      readonly _tag: 'SignedOut';
      /** The Accounts still signed in: every other's go. */
      readonly signedIn: ReadonlyArray<string>;
    };

/** The Capability that keeps each place's Saved Draft, for the Account named. */
export class SavedDrafts extends Context.Service<
  SavedDrafts,
  {
    /** The place's Saved Draft; null when none is kept, or none can be read. */
    readonly read: (
      accountId: string,
      place: Place,
    ) => Effect.Effect<Kept | null>;
    /**
     * Changes the place's Saved Draft from what is kept, one change at a
     * time for each place: null forgets it, and the draft kept, as it is,
     * leaves it. Gives the revision kept after, or null once there is none.
     */
    readonly write: (
      accountId: string,
      place: Place,
      change: (kept: Kept | null) => SavedDraft | null,
    ) => Effect.Effect<number | null>;
    /** Forgets every Saved Draft that went. */
    readonly drop: (gone: Gone) => Effect.Effect<void>;
  }
>()('code/SavedDrafts') {}
