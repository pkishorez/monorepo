import { useKeyboardOver } from '@kestack/web-platform/recipes/touch-layers';
import type * as Picker from '../../../../../../../../../ui/controls/picker/index.ts';
import type { EditorView } from '@codemirror/view';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  type ContextType,
} from 'react';
import type { Availability } from '../../../../../../voice/index.ts';
import type { ViewProps } from '@kestack/kabuki/react';
import { type Heard, isOpen, type TouchDraftLive } from './actor.ts';
import type { Phase, Stop } from './controls/index.ts';

/*
 * The Touch Draft's ties to the Draft around it: what the Draft hands it
 * (`Touch`), and what its View runs on (`useTouchDraft`).
 */

/** What the Touch Draft draws of the Draft's editing (`useDraft`). */
export interface Draft {
  /** The ref that moves the editor into the Touch Draft. */
  readonly mount: (element: HTMLDivElement | null) => void;
  readonly view: RefObject<EditorView | null>;
  readonly placeholder: string;
  /** Nothing in it yet, nor a Dictation coming. */
  readonly empty: boolean;
  /** Something to send. */
  readonly filled: boolean;
  readonly disabled: boolean;
  /** Text only: no file goes in, as in a Side Question. */
  readonly textOnly?: boolean;
  readonly files: { readonly add: (files: ReadonlyArray<File>) => unknown };
  readonly skills: {
    readonly how: typeof Picker.How.Type | null;
    readonly offered: boolean;
    readonly onOpen: (how: typeof Picker.How.Type, typed: boolean) => void;
    readonly picker: ReactNode;
  };
  readonly dictation: {
    readonly recording:
      | { readonly _tag: 'Waiting' }
      | {
          readonly _tag: 'Recording';
          readonly elapsed: ReactNode;
          readonly wave: ReactNode;
        }
      | null;
    readonly pending: {
      readonly _tag: 'Transcribing' | 'Failed' | 'Text';
      readonly id: number;
    } | null;
    /** Whether a Dictation could start now, and if not why. */
    readonly availability: Availability;
    /** Start one, or stop the one recording. */
    readonly onToggle: () => void;
    readonly onRetry: (id: number) => void;
    /** Throws it away, wherever it is: a failed one's clip too. */
    readonly onCancel: () => void;
    readonly onShown: () => () => void;
    readonly onChooseMicrophone?: () => void;
  };
  /** Makes it the Composer and focuses it, in the tap. */
  readonly write: (how?: { readonly scroll?: boolean }) => void;
  /** Sends it, if there is something to send. */
  readonly send: () => void;
}

/** What the Draft hands the Touch Draft's View. */
export const Touch = createContext<{
  readonly draft: Draft;
  /** Its files, and those refused, while there are any. */
  readonly attachments: ReactNode;
  /** The model chip. */
  readonly chip: ReactNode;
  /** What sending is called: Send, Steer, Ask or Start session. */
  readonly label: string;
  /** Nothing can be sent now, such as while offline. */
  readonly blocked: boolean;
  /** A new session is being started: Send waits. */
  readonly starting: boolean;
  /** The turn running, to stop, or null. */
  readonly stop: Stop | null;
  readonly onPaste: (text: string) => void;
  /** Where the View says how the Draft is sent on touch: through it. */
  readonly sending: RefObject<(() => void) | null>;
} | null>(null);

/*
 * What the Touch Draft's View runs on: the Dictation told to the Actor,
 * every send through it, opening and editing, the keyboard put away once
 * editing ends, and the one Phase its line is drawn in. A microphone
 * pressed while no Connection can transcribe says why instead.
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

/**
 * What focus leaving the card's words does: nothing, unless it was
 * editing and the card did not move the focus itself. Focus going to
 * something in the card, as Chrome gives a tapped button: nothing yet.
 * Taken by a press begun in the card, or in a layer it opened, such as a
 * tap on the model chip or Add, which iOS gives no focus at all: typing
 * ends, the keyboard goes down, and the card stays open, as Done, its
 * controls where the tap lands. Leaving it otherwise, by a press outside
 * or the keyboard put away, ends editing: with Smart Input it stays open,
 * as Done; without, it collapses.
 */
export const leaving = ({
  editing,
  moving,
  within,
  pressing,
  smart,
}: {
  readonly editing: boolean;
  readonly moving: boolean;
  /** Focus went to something in the card. */
  readonly within: boolean;
  /** A press begun in the card, or a layer it opened, is under way. */
  readonly pressing: boolean;
  readonly smart: boolean;
}): 'Done' | 'Collapse' | null =>
  !editing || moving || within ? null : pressing || smart ? 'Done' : 'Collapse';

/**
 * Whether a press begun in the card is under way: from its pointerdown,
 * heard by the card as React has it, so a press in a layer the card
 * opened counts, to the click that ends it or its pointercancel. A tap
 * moves focus after the finger lifts, just before its click, so the blur a
 * tap causes always comes while its press is under way. It cannot end at
 * pointerup: that comes before the tap's blur. So a drag in the card that
 * the browser neither cancels nor clicks counts until the next press, and
 * putting the keyboard away just after it keeps the card open.
 *
 * Heard on the window: it hears a press before any element as it goes
 * down, and after them all as it comes back up. React may hear it on the
 * document itself, where an app that draws the whole document has its
 * root, before a listener added there later, so one on the document
 * would undo what the card just heard.
 */
export function usePress() {
  const within = useRef(false);
  useEffect(() => {
    // Every press begins outside, until the card hears it.
    const over = () => void (within.current = false);
    window.addEventListener('pointerdown', over, true);
    window.addEventListener('pointercancel', over, true);
    // Bubbling, so it ends once the tap's own click has been handled.
    window.addEventListener('click', over);
    return () => {
      window.removeEventListener('pointerdown', over, true);
      window.removeEventListener('pointercancel', over, true);
      window.removeEventListener('click', over);
    };
  }, []);
  return {
    onPointerDownCapture: () => void (within.current = true),
    pressing: () => within.current,
  };
}

/** How long "Voice isn't on" shows, in ms. */
const NUDGE = 2_400;

export function useTouchDraft(
  slots: Slots,
  { model, state }: Pick<ViewProps<typeof TouchDraftLive>, 'model' | 'state'>,
  send: Send,
  /**
   * What holds the card, drawn as a box: its foot is the card's, and it
   * never moves as the card morphs open, as the card's own box does.
   */
  holder: RefObject<HTMLElement | null>,
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

  const expanded = isOpen(state);
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
      draft.write({ scroll: false });
      moving.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  // A tap on it collapsed: open, or draw it open and then edit. While a
  // Dictation records or is written out, only open: its words to read
  // and select, the keyboard down.
  const open = () => {
    if (
      (state._tag === 'Recording' || state._tag === 'Transcribing') &&
      !state.open
    )
      return send({ _tag: 'Open' });
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
    if (
      state._tag === 'Collapsed' ||
      ((state._tag === 'Recording' || state._tag === 'Transcribing') &&
        !state.open)
    )
      return open();
    if (state._tag !== 'Expanded') return;
    // Its words stay where they were scrolled to, as the keyboard rises.
    draft.write({ scroll: false });
    send({ _tag: 'Edit' });
  };
  // Collapsed by hand, a selection goes: a cursor is left at its end, so a
  // tap that opens it again starts from there. Left by a tap elsewhere, it
  // stays, for a keyboard that turns up after.
  const collapse = () => {
    blur();
    const view = draft.view.current;
    const main = view?.state.selection.main;
    if (view && main && !main.empty)
      view.dispatch({ selection: { anchor: main.head } });
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
    draft.dictation.onToggle();
  };
  // Thrown away by the Dictation's own cancel, a failed one's clip too.
  const cancel = () => {
    if (failed === null) send({ _tag: 'Cancel' });
    draft.dictation.onCancel();
  };
  // Told here first, so the Touch Draft knows what to do with the text.
  const take = (then: boolean) => {
    send({ _tag: 'Take', send: then });
    draft.dictation.onToggle();
  };
  const press = usePress();
  // Open at the page's foot: iOS pans the page only as far as the caret,
  // so its controls are padded up over the keyboard, measured from what
  // holds it. While open, not only editing: a tap on its own button ends
  // editing before the click lands, and the padding goes only once the
  // keyboard is down, not under it.
  const keyboard = useKeyboardOver(expanded, holder, card);
  const onBlur = (event: {
    readonly currentTarget: Element;
    readonly relatedTarget: EventTarget | null;
  }) => {
    const then = leaving({
      editing,
      moving: moving.current,
      within: event.currentTarget.contains(event.relatedTarget as Node),
      pressing: press.pressing(),
      smart: model.smart,
    });
    if (then !== null) send({ _tag: then });
  };
  return {
    expanded,
    editing,
    /** A Dictation records or is written out: a tap in the words selects, never edits. */
    dictating: state._tag === 'Recording' || state._tag === 'Transcribing',
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
    take: () => take(false),
    takeAndSend: () => take(true),
    retry: () => failed !== null && draft.dictation.onRetry(failed.id),
    cancel,
    onBlur,
    onPointerDownCapture: press.onPointerDownCapture,
    /** How much of its foot the keyboard covers, while it is open. */
    covered: keyboard.covered,
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
