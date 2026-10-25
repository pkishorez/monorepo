import { Clock, Effect, Schema, Stream, SubscriptionRef } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import {
  type Place,
  type SavedDraft,
  SavedDrafts,
  type Written,
} from '../../../../layer/capabilities/index.ts';
import { keeping } from '../../../../ui/keep/index.ts';
import { DraftMode, type Mode } from './mode/index.ts';

/*
 * The Draft as its Saved Draft, and back: what is saved is what the Draft
 * shows, its mode open, each mode's text and selection, the Message's
 * files and the picks, all in one save.
 *
 * 1. Read   once, before the Draft is drawn, under the Account signed in
 *           then: every save is the place's under that Account, even as
 *           the Draft goes after another Account is switched to.
 * 2. Save   a quarter of a second after any change, and at once as the
 *           page is hidden or left and as the Draft goes; a Draft that
 *           shows nothing deletes it. A send clears what it sent from the
 *           Draft, and so from its Saved Draft: a refused send's text
 *           comes back into the Draft and is saved as any edit, but one
 *           refused after the Draft has gone is lost.
 * 3. Start  a new session's, once its session has started, is deleted,
 *           and saved no more.
 */

// 1. Read
export const Where = Schema.Struct({
  accountId: Schema.String,
  machineId: Schema.String,
  projectId: Schema.String,
  sessionId: Schema.NullOr(Schema.String),
});
export type Where = typeof Where.Type;

const placeOf = ({ machineId, projectId, sessionId }: Where): Place => ({
  machineId,
  projectId,
  sessionId,
});

/** Where the Draft of a place is kept: under the Account signed in now, or nowhere with nobody signed in. */
export const whereOf = (place: Place) =>
  Effect.flatMap(Accounts, ({ current }) =>
    Effect.map(current, (state): Where | null =>
      state._tag === 'SignedIn'
        ? { accountId: state.active.id, ...place }
        : null,
    ),
  );

export const read = (where: Where) =>
  Effect.flatMap(SavedDrafts, (saved) =>
    saved.read(where.accountId, placeOf(where)),
  );

/**
 * A Saved Draft as the Draft takes it back: a mode it no longer has is the
 * Message, and a cursor past the end of its text is at the end.
 */
export const restoredOf = (
  { mode, written, attachments, chosen }: SavedDraft,
  modes: ReadonlyArray<Mode>,
) => {
  const writtenIn = (each: Mode): Written => {
    const kept = written[each] ?? DraftMode.blank;
    const end = kept.text.length;
    return {
      text: kept.text,
      anchor: Math.min(kept.anchor, end),
      head: Math.min(kept.head, end),
    };
  };
  return {
    mode: modes.find((each) => each === mode) ?? 'Message',
    attachments,
    chosen,
    opening: {
      Message: writtenIn('Message'),
      SideQuestion: writtenIn('SideQuestion'),
    },
  };
};

// 2. Save

/** What of the Draft its Saved Draft holds, as the Draft has it. */
export interface Shown {
  /** Read back, and under an Account: until then nothing is saved. */
  readonly restored: boolean;
  readonly where: Where | null;
  /** Its session has started: its Saved Draft is deleted, and saved no more. */
  readonly started: boolean;
  readonly mode: Mode;
  /** Each mode's text as it started, until the mode shows its own. */
  readonly opening: Readonly<Record<Mode, Written>>;
  readonly attachments: SavedDraft['attachments'];
  readonly chosen: SavedDraft['chosen'];
}

/** The Saved Draft of what the Draft shows: null when it shows nothing. */
export const savedOf = (
  shown: Shown,
  modes: ReadonlyArray<Mode>,
  texts: Partial<Record<Mode, Written>>,
): SavedDraft | null => {
  const written = Object.fromEntries(
    modes.map((mode) => [mode, texts[mode] ?? shown.opening[mode]]),
  );
  const { mode, attachments, chosen } = shown;
  const empty =
    mode === 'Message' &&
    Object.values(written).every(({ text }) => text === '') &&
    attachments.length === 0 &&
    chosen.account === null &&
    chosen.model === null &&
    Object.keys(chosen.settings).length === 0;
  return empty ? null : { mode, written, attachments, chosen };
};

/** The part of the Draft's Self its saves read. */
interface Read<P> {
  readonly get: Effect.Effect<{ readonly model: Shown; readonly props: P }>;
  readonly changes: Stream.Stream<unknown>;
}

/**
 * The Draft's saves, for as long as it lives, one after another: each
 * mode shows its text into `texts`, and every change of it or of the
 * Draft is saved as one. Each is stamped before it reads the Draft, so a
 * save of this place from a Draft gone before is never applied over it.
 */
export const saving = <P>(
  self: Read<P>,
  modesOf: (props: P) => ReadonlyArray<Mode>,
  texts: SubscriptionRef.SubscriptionRef<Partial<Record<Mode, Written>>>,
) =>
  Effect.gen(function* () {
    const saved = yield* SavedDrafts;
    const since = yield* Clock.monotonicTimeNanos;
    // What was saved last; null until a first save, which is always made.
    let last: string | null = null;
    let deleted = false;
    const save = Effect.gen(function* () {
      const at = yield* Clock.monotonicTimeNanos;
      const { model, props } = yield* self.get;
      const { restored, where, started } = model;
      if (!restored || where === null || deleted) return;
      const draft = started
        ? null
        : savedOf(model, modesOf(props), yield* SubscriptionRef.get(texts));
      const json = JSON.stringify(draft);
      if (json === last && !started) return;
      const made = yield* saved.save(
        where.accountId,
        placeOf(where),
        draft,
        at,
        since,
      );
      if (!made) return;
      last = json;
      deleted = started;
    });
    yield* keeping(
      Stream.merge(self.changes, SubscriptionRef.changes(texts)),
      save,
    );
  });
