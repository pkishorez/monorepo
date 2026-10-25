import { EditorView } from '@codemirror/view';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ArrowUpIcon,
  PencilIcon,
  SquareSlashIcon,
  XIcon,
} from '@kestack/web-platform/ui/components/lucide';
import {
  AnimatePresence,
  motion,
  MotionConfig,
} from '@kestack/web-platform/ui/components/motion';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import * as Picker from '../../../../../ui/picker/index.ts';
import { Heard, TouchDraftLive } from './actor.ts';
import { MainButton } from './main-button.tsx';
import { QuickActions } from './quick-actions.tsx';

/*
 * The Touch Draft as drawn, from its State; the Draft around it hands the
 * rest through `Touch`.
 *
 * 1. Left      a card as tall as the button's column: the Draft's words,
 *              two lines of them, read only, and edit; under them the
 *              model chip, Skills and Quick actions. Tapping the words
 *              shows all of them, scrolling, and tapping again two lines;
 *              an empty Draft's placeholder edits it. While a Dictation
 *              records, the line under them is cancel, its time and its
 *              level; while one is written out to be sent, that it will
 *              be. Words past the two lines fade out at the foot.
 * 2. Right     the main button and Send (`main-button.tsx`).
 * 3. Editing   the whole card is the Composer, above the keyboard, with
 *              Done and Send; focus leaving it, Done or sending makes the
 *              Draft read only again.
 * 4. Dictate   as one is written out, the Draft brings where its text
 *              goes into view and says "Transcribing…" there; its text
 *              then comes in out of a blur (`styles.css`).
 *
 * Each change of State moves with `motion/react`; while a field has
 * focus nothing does.
 */

/** What the Touch Draft draws of the Draft's editing (`useDraft`). */
export interface Draft {
  /** The element the editor is drawn in, and the ref that moves it there. */
  readonly parent: RefObject<HTMLDivElement | null>;
  readonly mount: (element: HTMLDivElement | null) => void;
  readonly view: RefObject<EditorView | null>;
  /** Set here: brings a Dictation's placeholder into view. */
  readonly reveal: RefObject<(() => void) | null>;
  readonly placeholder: string;
  /** Nothing in it yet, nor a Dictation coming. */
  readonly empty: boolean;
  /** Something to send. */
  readonly filled: boolean;
  readonly disabled: boolean;
  readonly files: { readonly add: (files: ReadonlyArray<File>) => unknown };
  readonly skills: {
    readonly how: typeof Picker.How.Type | null;
    readonly offered: boolean;
    readonly onOpen: (how: typeof Picker.How.Type, typed: boolean) => void;
    readonly picker: ReactNode;
  };
  readonly dictation: {
    readonly recording:
      | { readonly _tag: 'Starting' }
      | {
          readonly _tag: 'Recording';
          readonly elapsed: ReactNode;
          readonly wave: ReactNode;
        }
      | null;
    readonly pending: {
      readonly _tag: 'Transcribing' | 'Failed' | 'Text';
    } | null;
    readonly onShown: () => () => void;
    readonly onChooseMicrophone?: () => void;
  };
  /** Makes it the Composer and focuses it, in the tap. */
  readonly write: () => void;
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
  /** A new session is being started: the main button waits. */
  readonly starting: boolean;
  /** What the page adds, such as Stop. */
  readonly actions?: ReactNode;
  /** Starts the Draft with `/btw`, for a question on the side; null where there is no Session to ask. */
  readonly onAsk: (() => void) | null;
  readonly onPaste: (text: string) => void;
  /** Where the View says how the Draft is sent on touch: through it. */
  readonly sending: RefObject<(() => void) | null>;
} | null>(null);

/** One line of its words, at 16px and 1.75 line height. */
const LINE = 28;

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
 * Keeps focus where it is on a press: the Composer stays the Composer, its
 * keyboard up, as Send is pressed.
 */
const keepFocus = (event: { preventDefault: () => void }) =>
  event.preventDefault();

const SWAP = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;

export const TouchDraftView = View.make(
  TouchDraftLive,
  ({ root, state, send }) => {
    const slots = use(Touch);
    if (slots === null)
      throw new Error('The Touch Draft is drawn only in a Draft');
    const { draft, sending } = slots;
    const { onShown } = draft.dictation;
    useEffect(onShown, [onShown]);

    // The Dictation, as it stands for this Draft, told to the Touch Draft
    // with whether the Draft could be sent as it moves.
    const heard = heardOf(draft.dictation);
    const sendable = !slots.blocked && !draft.disabled;
    useEffect(
      () => send({ _tag: 'Heard', dictation: heard, sendable }),
      [heard],
    );
    // Every send on touch goes through it: Send, the swipe and Enter.
    useEffect(() => {
      sending.current = () => send({ _tag: 'Send' });
      return () => void (sending.current = null);
    });

    const editing = state._tag === 'Editing';
    const [expanded, setExpanded] = useState(false);
    // Read only, it is clipped to two lines, not scrolled, showing whole
    // lines: `shift` of them are above it.
    const [shift, setShift] = useState(0);
    const collapsed = !editing && !expanded;
    const more = useMoreThan(draft.parent, 2 * LINE);
    const toggles = !editing && !draft.empty && (more || expanded);
    const scroller = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (draft.empty) setShift(0);
      if (draft.empty) setExpanded(false);
    }, [draft.empty]);

    // 3. Editing ended, by Done or a send: focus goes, and the keyboard.
    useEffect(() => {
      if (!editing) draft.view.current?.contentDOM.blur();
      setExpanded(false);
    }, [editing]);

    // 4. Dictate: where its text goes is brought into view.
    useEffect(() => {
      draft.reveal.current = () => {
        const parent = draft.parent.current;
        const spot = parent?.querySelector('.cm-dictation');
        if (parent == null || spot == null) return;
        if (collapsed) {
          const at = Math.floor(
            (spot.getBoundingClientRect().top -
              parent.getBoundingClientRect().top) /
              LINE,
          );
          setShift((now) => (at < now ? at : at > now + 1 ? at - 1 : now));
          return;
        }
        spot.scrollIntoView({
          block: 'nearest',
          behavior:
            editing || matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'auto'
              : 'smooth',
        });
      };
      return () => void (draft.reveal.current = null);
    });

    // 3. Editing: as its size changes, as when the keyboard rises, the
    // cursor stays in view.
    useEffect(() => {
      const box = scroller.current;
      if (!editing || box === null) return;
      const observer = new ResizeObserver(() => {
        const view = draft.view.current;
        view?.dispatch({
          effects: EditorView.scrollIntoView(view.state.selection.main.head, {
            y: 'nearest',
            yMargin: 8,
          }),
        });
      });
      observer.observe(box);
      return () => observer.disconnect();
    }, [editing]);

    // Focus first, in the tap itself: iOS raises its keyboard only then.
    const resting = state._tag === 'Resting';
    const edit = () => {
      if (draft.disabled || !resting) return;
      draft.write();
      send({ _tag: 'Edit' });
    };
    const done = () => send({ _tag: 'Done' });
    // A question on the side: `/btw` at the start, then edited.
    const onAsk = slots.onAsk;
    const ask =
      onAsk === null
        ? null
        : () => {
            if (draft.disabled) return;
            onAsk();
            edit();
          };
    const canSend = draft.filled && !slots.blocked && !draft.disabled;
    const recording = draft.dictation.recording;

    return (
      <MotionConfig
        reducedMotion="user"
        transition={editing ? { duration: 0 } : SWAP}
      >
        <div {...root} className="flex flex-col gap-2">
          {slots.actions !== undefined && slots.actions !== false && (
            <div className="flex justify-end">{slots.actions}</div>
          )}
          <div className="flex items-end gap-3">
            <div
              data-slot="draft"
              data-touch=""
              data-writing={editing || undefined}
              data-recording={recording !== null || undefined}
              data-disabled={draft.disabled || undefined}
              onBlur={(event) => {
                if (
                  editing &&
                  !event.currentTarget.contains(event.relatedTarget as Node)
                )
                  done();
              }}
              className={cn(
                'group/draft flex min-w-0 flex-1 flex-col rounded-[1.375rem] border border-border bg-card p-1 transition-[border-color] duration-200 ease-out motion-reduce:transition-none data-recording:border-destructive/50',
                // As tall as the button's column, the line under the words included.
                !editing && 'min-h-29',
              )}
            >
              <div className="relative flex min-h-0 min-w-0 flex-1 items-start">
                <div
                  ref={scroller}
                  onClick={() => {
                    if (editing) return;
                    if (draft.empty) edit();
                    else if (expanded || more) setExpanded(!expanded);
                  }}
                  // Its words are the control that shows them whole, for
                  // the keys and a screen reader too: no button of its own.
                  {...(toggles
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-expanded': expanded,
                        'aria-label': expanded
                          ? 'Show less of the message'
                          : 'Show the whole message',
                        onKeyDown: (event: KeyboardEvent) => {
                          if (event.key !== 'Enter' && event.key !== ' ')
                            return;
                          // Its own, not the page's Enter, which sends.
                          event.preventDefault();
                          event.stopPropagation();
                          setExpanded(!expanded);
                        },
                      }
                    : {})}
                  className={cn(
                    'focus-ring relative min-w-0 flex-1 rounded-2xl pl-3 text-foreground group-data-disabled/draft:opacity-40',
                    editing ? 'pr-3' : 'pr-1',
                    editing || expanded
                      ? 'max-h-[min(40dvh,20rem)] overflow-y-auto overscroll-contain py-2 [mask-image:linear-gradient(to_bottom,transparent,black_0.5rem,black_calc(100%-0.5rem),transparent)]'
                      : 'mt-1.5 h-14 overflow-clip',
                    collapsed &&
                      more &&
                      '[mask-image:linear-gradient(to_bottom,black_60%,transparent)]',
                    editing && 'min-h-[calc(3*1.75rem+1rem)]',
                  )}
                >
                  {draft.empty && (
                    <p
                      aria-hidden
                      className={cn(
                        'pointer-events-none absolute inset-x-3 truncate text-base leading-[1.75] text-muted-foreground',
                        editing ? 'top-2' : 'top-0',
                      )}
                    >
                      {draft.placeholder}
                    </p>
                  )}
                  {/* Read only, its words take no tap; a button in them,
                      such as a failed Dictation's Retry, still does. */}
                  <div
                    ref={draft.mount}
                    style={
                      collapsed && shift > 0
                        ? { transform: `translateY(${-shift * LINE}px)` }
                        : undefined
                    }
                    className={cn(
                      'relative',
                      !editing &&
                        'pointer-events-none [&_button]:pointer-events-auto',
                      !editing && draft.empty && 'opacity-0',
                      collapsed &&
                        'transition-transform duration-300 ease-out motion-reduce:transition-none',
                    )}
                  />
                </div>
                {!editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Edit the message"
                    disabled={draft.disabled || !resting}
                    onClick={edit}
                    className="size-11 shrink-0 rounded-full text-muted-foreground [&_svg:not([class*=size-])]:size-4.5"
                  >
                    <PencilIcon aria-hidden />
                  </Button>
                )}
              </div>
              {slots.attachments !== null && (
                <div className="px-2 pt-1">{slots.attachments}</div>
              )}
              <div className="flex h-11 min-w-0 items-center">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={
                      state._tag === 'Editing' || state._tag === 'Recording'
                        ? state._tag
                        : state._tag === 'Transcribing' && state.then === 'send'
                          ? 'sends'
                          : 'tools'
                    }
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex min-w-0 flex-1 items-center gap-0.5"
                  >
                    {editing ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          onMouseDown={keepFocus}
                          onClick={() => {
                            draft.view.current?.contentDOM.blur();
                            done();
                          }}
                          className="h-11 rounded-full px-4 text-base font-medium"
                        >
                          Done
                        </Button>
                        <div className="flex-1" />
                        <Button
                          type="button"
                          size="icon"
                          aria-label={slots.label}
                          disabled={!canSend}
                          onMouseDown={keepFocus}
                          onClick={draft.send}
                          className="size-11 shrink-0 rounded-full [&_svg:not([class*=size-])]:size-5"
                        >
                          <ArrowUpIcon aria-hidden />
                        </Button>
                      </>
                    ) : state._tag === 'Recording' ? (
                      <Recording
                        recording={recording}
                        onCancel={() => send({ _tag: 'Cancel' })}
                      />
                    ) : state._tag === 'Transcribing' &&
                      state.then === 'send' ? (
                      // Its words say "Transcribing…" where the text goes.
                      // Cancel stays, so a send regretted can still be stopped.
                      <>
                        <CancelDictation
                          onCancel={() => send({ _tag: 'Cancel' })}
                        />
                        <p
                          role="status"
                          className="ml-1 flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <ArrowUpIcon aria-hidden className="size-4" />
                          Sends once transcribed
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex min-w-0 flex-1">{slots.chip}</div>
                        <Skills draft={draft} />
                        <QuickActions
                          disabled={draft.disabled}
                          onAsk={ask}
                          onPaste={slots.onPaste}
                          onFiles={(files) => void draft.files.add(files)}
                          onChooseMicrophone={
                            draft.dictation.onChooseMicrophone
                          }
                        />
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {!editing && (
                <motion.div
                  key="main"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="origin-bottom-right"
                >
                  <MainButton
                    does={
                      state._tag === 'Recording'
                        ? 'take'
                        : state._tag === 'Resting' && !slots.starting
                          ? 'dictate'
                          : 'busy'
                    }
                    send={
                      state._tag === 'Recording' && !slots.blocked
                        ? 'Take and send'
                        : state._tag === 'Resting' && canSend
                          ? slots.label
                          : null
                    }
                    disabled={draft.disabled}
                    onPress={() =>
                      send(
                        state._tag === 'Recording'
                          ? { _tag: 'Take', send: false }
                          : { _tag: 'Dictate' },
                      )
                    }
                    onSend={() =>
                      state._tag === 'Recording'
                        ? send({ _tag: 'Take', send: true })
                        : draft.send()
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </MotionConfig>
    );
  },
);

/** Whether the element `ref` holds is taller than `height`, as it changes. */
function useMoreThan(
  ref: RefObject<HTMLElement | null>,
  height: number,
): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () => setMore(element.scrollHeight > height + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, height]);
  return more;
}

/** Throws the Dictation away, recording or transcribed: nothing goes in. */
function CancelDictation({ onCancel }: { readonly onCancel: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Cancel the Dictation"
      onClick={onCancel}
      className="size-11 shrink-0 rounded-full text-muted-foreground [&_svg:not([class*=size-])]:size-5"
    >
      <XIcon aria-hidden />
    </Button>
  );
}

/** The line under the words while a Dictation records: cancel, its time and level. */
function Recording({
  recording,
  onCancel,
}: {
  readonly recording: Draft['dictation']['recording'];
  readonly onCancel: () => void;
}) {
  return (
    <>
      <CancelDictation onCancel={onCancel} />
      <span
        aria-hidden
        className="ml-1 size-2 shrink-0 animate-breathe rounded-full bg-destructive motion-reduce:animate-none"
      />
      {recording?._tag === 'Recording' ? (
        <span
          role="status"
          className="ml-2 flex items-center gap-2 text-sm text-foreground"
        >
          <span className="sr-only">Recording</span>
          {recording.elapsed}
          {recording.wave}
        </span>
      ) : (
        <span role="status" className="ml-2 text-sm text-muted-foreground">
          Opening the microphone…
        </span>
      )}
    </>
  );
}

/** Skills, in a Dialog opened by touch. */
function Skills({ draft }: { readonly draft: Draft }) {
  return (
    <Picker.Frame
      how={draft.skills.how}
      mode="dialog"
      label="Skills and commands"
      onOpen={(how) => draft.skills.onOpen(how, false)}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Add a skill or command"
          disabled={draft.disabled || !draft.skills.offered}
          className="size-11 shrink-0 rounded-full text-muted-foreground [&_svg:not([class*=size-])]:size-5"
        >
          <SquareSlashIcon aria-hidden />
        </Button>
      }
    >
      {draft.skills.picker}
    </Picker.Frame>
  );
}
