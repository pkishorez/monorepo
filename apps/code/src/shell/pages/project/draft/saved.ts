import { Effect, Queue, Schema, Stream } from 'effect';
import { Command } from '@kestack/kabuki';
import {
  type Place,
  type SavedDraft,
  SavedDrafts,
} from '../../../../layer/capabilities/index.ts';
import { DraftMode, type Mode, type Written } from './mode/index.ts';

/*
 * The Draft as a Saved Draft, and back: the Draft Mode open, each mode's
 * text and selection, the Message's files and what was picked. One with
 * nothing written, no file and nothing picked is no Saved Draft: keeping
 * it forgets the place's.
 */

/** What the Draft keeps of itself. */
interface Kept {
  readonly mode: Mode;
  readonly written: Readonly<Record<Mode, Written>>;
  readonly attachments: SavedDraft['attachments'];
  readonly chosen: SavedDraft['chosen'];
}

export const savedOf = ({
  mode,
  written,
  attachments,
  chosen,
}: Kept): SavedDraft => ({ mode, written, attachments, chosen });

const isEmpty = ({ written, attachments, chosen }: SavedDraft) =>
  Object.values(written).every(({ text }) => text === '') &&
  attachments.length === 0 &&
  chosen.account === null &&
  chosen.model === null &&
  Object.keys(chosen.settings).length === 0;

/** Keeps the Draft for its place, or forgets the place's when there is nothing to keep. */
export const keep = (place: Place, draft: SavedDraft) =>
  Effect.flatMap(SavedDrafts, (saved) =>
    isEmpty(draft) ? saved.clear(place) : saved.write(place, draft),
  );

/** Forgets the place's Saved Draft, as once its Message is sent. */
export const forget = Command.make('ForgetSavedDraft', {
  args: Schema.Struct({
    machineId: Schema.String,
    projectId: Schema.String,
    sessionId: Schema.NullOr(Schema.String),
  }),
  run: (place) => Effect.flatMap(SavedDrafts, (saved) => saved.clear(place)),
});

/** A Saved Draft as the Draft takes it back: a mode it no longer has is the Message. */
export const restoredOf = (
  draft: SavedDraft,
  modes: ReadonlyArray<Mode>,
): Kept => {
  const mode = DraftMode.modeOf(draft.mode);
  const writtenIn = (each: Mode) => {
    const kept = draft.written[each] ?? DraftMode.blank;
    const end = kept.text.length;
    return {
      text: kept.text,
      anchor: Math.min(kept.anchor, end),
      head: Math.min(kept.head, end),
    };
  };
  return {
    mode: modes.includes(mode) ? mode : 'Message',
    written: {
      Message: writtenIn('Message'),
      SideQuestion: writtenIn('SideQuestion'),
    },
    attachments: draft.attachments,
    chosen: draft.chosen,
  };
};

/**
 * Once each time the page is hidden or left, as the browser says: a tab
 * switched away from, the app put in the background, a reload. None
 * outside a browser.
 */
export const leaving: Stream.Stream<void> =
  typeof document === 'undefined'
    ? Stream.never
    : Stream.callback<void>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const hidden = () => {
              if (document.visibilityState === 'hidden')
                Queue.offerUnsafe(queue, undefined);
            };
            const left = () => Queue.offerUnsafe(queue, undefined);
            document.addEventListener('visibilitychange', hidden);
            window.addEventListener('pagehide', left);
            return () => {
              document.removeEventListener('visibilitychange', hidden);
              window.removeEventListener('pagehide', left);
            };
          }),
          (stop) => Effect.sync(stop),
        ),
      );
