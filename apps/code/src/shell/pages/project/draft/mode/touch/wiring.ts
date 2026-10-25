import type { ViewProps } from '@kestack/kabuki/react';
import { useEffect, useState, type ContextType } from 'react';
import type { Heard, Mode, State, TouchDraftLive } from './actor.ts';
import type { Draft, Touch } from './view.tsx';

/*
 * What the Touch Draft's View runs on.
 *
 * 1. useTouchDraft  the Dictation told to the Actor, every send through
 *                   it, editing in the tap, the keyboard put away once
 *                   editing ends, and the talk bar's one job.
 * 2. useMode        text or voice, as the Actor keeps it: voice only
 *                   while a Machine can transcribe; asked for when it
 *                   can't, it nudges instead.
 */

type Send = ViewProps<typeof TouchDraftLive>['send'];
type Slots = NonNullable<ContextType<typeof Touch>>;

const heardOf = ({
  recording,
  pending,
}: Draft['dictation']): typeof Heard.Type =>
  recording !== null
    ? 'recording'
    : pending === null
      ? 'idle'
      : pending._tag === 'Transcribing'
        ? 'transcribing'
        : pending._tag === 'Failed'
          ? 'failed'
          : 'text';

// 1. useTouchDraft
export function useTouchDraft(
  slots: Slots,
  state: typeof State.Type,
  send: Send,
) {
  const { draft, sending } = slots;
  const { onShown } = draft.dictation;
  useEffect(onShown, [onShown]);

  // The Dictation, as it stands for this Draft, told to the Touch Draft
  // with whether the Draft could be sent as it moves.
  const heard = heardOf(draft.dictation);
  const sendable = !slots.blocked && !draft.disabled;
  useEffect(() => send({ _tag: 'Heard', dictation: heard, sendable }), [heard]);
  // Every send on touch goes through it: Send and Enter.
  useEffect(() => {
    sending.current = () => send({ _tag: 'Send' });
    return () => void (sending.current = null);
  });

  // Editing ended, by Done or a send: focus goes, and the keyboard.
  const editing = state._tag === 'Editing';
  useEffect(() => {
    if (!editing) draft.view.current?.contentDOM.blur();
  }, [editing]);

  // Focus first, in the tap itself: iOS raises its keyboard only then.
  const edit = () => {
    if (draft.disabled || state._tag !== 'Resting') return;
    draft.write();
    send({ _tag: 'Edit' });
  };
  const done = () => {
    draft.view.current?.contentDOM.blur();
    send({ _tag: 'Done' });
  };
  // A question on the side: `/btw` at the start, then edited.
  const { onAsk } = slots;
  const ask =
    onAsk === null
      ? null
      : () => {
          if (draft.disabled) return;
          onAsk();
          edit();
        };

  const recording = state._tag === 'Recording';
  const failed =
    draft.dictation.pending?._tag === 'Failed' ? draft.dictation.pending : null;
  const busy =
    state._tag === 'Transcribing' ||
    state._tag === 'Sending' ||
    draft.dictation.recording?._tag === 'Starting' ||
    slots.starting;
  const voice = recording
    ? 'take'
    : failed !== null
      ? 'resend'
      : busy
        ? 'busy'
        : 'dictate';
  const talk = () => {
    if (voice === 'take') send({ _tag: 'Take', send: false });
    else if (voice === 'dictate') send({ _tag: 'Dictate' });
    else if (voice === 'resend' && failed !== null)
      draft.dictation.onRetry(failed.id);
  };
  // A failed one's clip goes with the Dictation's own cancel.
  const cancel = () =>
    failed !== null ? draft.dictation.onCancel() : send({ _tag: 'Cancel' });
  // Focus leaving the card, editing, is done.
  const onBlur = (event: {
    readonly currentTarget: Element;
    readonly relatedTarget: EventTarget | null;
  }) => {
    if (editing && !event.currentTarget.contains(event.relatedTarget as Node))
      send({ _tag: 'Done' });
  };
  return {
    editing,
    recording,
    failed: failed !== null,
    voice,
    canSend: draft.filled && sendable,
    edit,
    done,
    ask,
    talk,
    takeAndSend: () => send({ _tag: 'Take', send: true }),
    cancel,
    onBlur,
  } as const;
}

/** How long "Voice isn't on" shows, in ms. */
const NUDGE = 2_400;

// 2. useMode
export function useMode(
  draft: Draft,
  chosen: typeof Mode.Type,
  recording: boolean,
  send: Send,
) {
  const [nudged, setNudged] = useState<number | null>(null);
  useEffect(() => {
    if (nudged === null) return;
    const timer = setTimeout(() => setNudged(null), NUDGE);
    return () => clearTimeout(timer);
  }, [nudged]);
  const { availability } = draft.dictation;
  const ready = availability._tag === 'Ready';
  const mode = recording ? 'voice' : ready ? chosen : 'text';
  // Android buzzes; iOS cannot.
  const choose = (next: typeof Mode.Type) => {
    if (next === 'voice' && !ready) {
      navigator.vibrate?.([6, 40, 6]);
      return setNudged(Date.now());
    }
    send({ _tag: 'Choose', mode: next });
    navigator.vibrate?.(8);
  };
  return {
    mode,
    choose,
    ready,
    /** Why voice can't be had now, while it shows; its key replays the shake. */
    nudge:
      nudged === null || ready
        ? null
        : {
            key: nudged,
            said:
              availability._tag === 'Downloading'
                ? `Voice is getting ready · ${Math.round(availability.progress * 100)}%`
                : "Voice isn't on",
          },
    // Text on the left, voice on the right; from text, a Swipe right is
    // the sidebar's.
    swipes: recording
      ? {}
      : mode === 'voice'
        ? { right: () => choose('text') }
        : { left: () => choose('voice') },
  };
}
