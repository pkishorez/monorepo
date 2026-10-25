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

/** One Draft Mode's text, and its cursor or selection. */
const Written = Schema.Struct({
  text: Schema.String,
  anchor: Schema.Finite,
  head: Schema.Finite,
});

/**
 * A Saved Draft: the Draft Mode open; each mode's text and selection, by
 * mode; the Message's files, as they are sent, with their sizes; and the
 * agent, model and settings picked, null where none was.
 */
export const SavedDraft = Schema.Struct({
  mode: Schema.String,
  written: Schema.Record(Schema.String, Written),
  attachments: Schema.Array(
    Schema.Struct({ ...AttachmentSchema.fields, size: Schema.Finite }),
  ),
  chosen: Schema.Struct({
    account: Schema.NullOr(Schema.String),
    model: Schema.NullOr(Schema.String),
    settings: Schema.Record(Schema.String, Schema.String),
  }),
});
export type SavedDraft = typeof SavedDraft.Type;

/** The Capability that keeps each place's Saved Draft for the Account signed in. */
export class SavedDrafts extends Context.Service<
  SavedDrafts,
  {
    /** The place's Saved Draft; null when none is kept, or none can be read. */
    readonly read: (place: Place) => Effect.Effect<SavedDraft | null>;
    readonly write: (place: Place, draft: SavedDraft) => Effect.Effect<void>;
    /** Forgets the place's Saved Draft. */
    readonly clear: (place: Place) => Effect.Effect<void>;
    /** Forgets every Saved Draft of a Project removed, its Sessions' too. */
    readonly dropProject: (
      machineId: string,
      projectId: string,
    ) => Effect.Effect<void>;
    /** Forgets every Saved Draft of one Machine of the Account. */
    readonly dropMachine: (
      accountId: string,
      machineId: string,
    ) => Effect.Effect<void>;
    /** Forgets every Saved Draft of the Account's Machines not listed. */
    readonly keepMachines: (
      accountId: string,
      machineIds: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    /** Forgets every Saved Draft of the Accounts not listed. */
    readonly keepAccounts: (
      accountIds: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
  }
>()('code/SavedDrafts') {}
