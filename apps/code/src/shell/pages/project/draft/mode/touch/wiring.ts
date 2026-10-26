import type { ViewProps } from '@kestack/kabuki/react';
import { useEffect, useRef, useState, type ContextType } from 'react';
import type { Heard, TouchDraftLive } from './actor.ts';
import type { Phase } from './controls/index.ts';
import type { Draft, Touch } from './view.tsx';

/*
 * What the Touch Draft's View runs on: the Dictation told to the Actor,
 * every send through it, opening and editing, the keyboard put away once
 * editing ends, and the one Phase its line is drawn in. A microphone
 * pressed while no Machine can transcribe says why instead.
 *
 * iOS raises its keyboard only for focus given in the tap, and slides
 * what has focus into view as it rises, where it is then. Opened straight
 * to Editing, the card is first drawn open in the tap itself, its
 * `data-collapsed` taken off by hand, and only then the words take focus:
 * the slide finds them where they will stay. Its State follows, drawing
 * the card as it already is.
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

/** How long "Voice isn't on" shows, in ms. */
const NUDGE = 2_400;

export function useTouchDraft(
  slots: Slots,
  { model, state }: Pick<ViewProps<typeof TouchDraftLive>, 'model' | 'state'>,
  send: Send,
) {
  const { draft, sending } = slots;
  const { onShown, availability } = draft.dictation;
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

  const expanded =
    state._tag === 'Expanded' ||
    state._tag === 'Editing' ||
    ((state._tag === 'Recording' || state._tag === 'Transcribing') &&
      state.open);
  const editing = state._tag === 'Editing';
  // The card, drawn open by hand in a tap that opens it to edit.
  const card = useRef<HTMLDivElement>(null);
  // Focus it moves itself, which is no leaving.
  const moving = useRef(false);
  const blur = () => {
    moving.current = true;
    draft.view.current?.contentDOM.blur();
    moving.current = false;
  };
  // Editing ended, by Done, Collapse or a send, focus goes, and the
  // keyboard; editing without it, as when the tap could not give it, the
  // words take it once drawn.
  useEffect(() => {
    if (!editing) return blur();
    const frame = requestAnimationFrame(() => {
      if (draft.view.current?.hasFocus) return;
      moving.current = true;
      draft.write();
      moving.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  // A tap on it collapsed: open, or draw it open and then edit.
  const open = () => {
    if (draft.disabled || state._tag !== 'Collapsed') return;
    if (!model.smart && card.current !== null) {
      card.current.removeAttribute('data-collapsed');
      // Laid out open before the focus, which iOS slides into view.
      void card.current.offsetHeight;
      draft.write();
    }
    send({ _tag: 'Open' });
  };
  // Open already, the card keeps its size: the words take focus in the tap.
  const edit = () => {
    if (draft.disabled) return;
    if (state._tag === 'Collapsed') return open();
    if (state._tag !== 'Expanded') return;
    draft.write();
    send({ _tag: 'Edit' });
  };
  const collapse = () => {
    blur();
    send({ _tag: 'Collapse' });
  };
  // Smart Input: stop typing, and stay open.
  const done = () => {
    blur();
    send({ _tag: 'Done' });
  };

  // Voice can't be had: the microphone says why, for a moment.
  const [nudged, setNudged] = useState<number | null>(null);
  useEffect(() => {
    if (nudged === null) return;
    const timer = setTimeout(() => setNudged(null), NUDGE);
    return () => clearTimeout(timer);
  }, [nudged]);
  const ready = availability._tag === 'Ready';

  const failed =
    draft.dictation.pending?._tag === 'Failed' ? draft.dictation.pending : null;
  const phase: Phase =
    state._tag === 'Recording'
      ? draft.dictation.recording?._tag === 'Waiting'
        ? 'waiting'
        : 'recording'
      : state._tag === 'Transcribing'
        ? 'transcribing'
        : failed !== null
          ? 'failed'
          : 'idle';
  // Android buzzes; iOS cannot.
  const dictate = () => {
    if (!ready) {
      navigator.vibrate?.([6, 40, 6]);
      return setNudged(Date.now());
    }
    blur();
    send({ _tag: 'Dictate' });
  };
  // A failed one's clip goes with the Dictation's own cancel.
  const cancel = () =>
    failed !== null ? draft.dictation.onCancel() : send({ _tag: 'Cancel' });
  // Focus leaving the card while editing ends it: with Smart Input it
  // stays open, as Done; without, it collapses.
  const onBlur = (event: {
    readonly currentTarget: Element;
    readonly relatedTarget: EventTarget | null;
  }) => {
    if (
      editing &&
      !moving.current &&
      !event.currentTarget.contains(event.relatedTarget as Node)
    )
      send({ _tag: model.smart ? 'Done' : 'Collapse' });
  };
  return {
    expanded,
    editing,
    smart: model.smart,
    displace: model.displace,
    card,
    open,
    edit,
    done,
    phase,
    canSend: draft.filled && sendable,
    collapse,
    dictate,
    take: () => send({ _tag: 'Take', send: false }),
    takeAndSend: () => send({ _tag: 'Take', send: true }),
    retry: () => failed !== null && draft.dictation.onRetry(failed.id),
    cancel,
    onBlur,
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
  } as const;
}
