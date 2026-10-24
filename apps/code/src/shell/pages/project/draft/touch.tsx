import { EditorView } from '@codemirror/view';
import {
  Drawer,
  LayerHeader,
} from '@kestack/web-platform/recipes/touch-layers';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ImageIcon,
  MicIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  SquareIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import * as Picker from '../../../../ui/picker/index.ts';
import { AttachmentStrip } from './attachments/index.ts';
import { Heading, type Draft } from './card.tsx';

/*
 * The Draft on a device with no keyboard.
 *
 * 1. Rest     read only, and two lines tall whatever its length; tapping
 *             its words does nothing. Beside them, its edit button, and,
 *             when there is more, the button that shows all of it,
 *             scrolling, up to a cap, and back to two lines. Empty, it is
 *             one wide "Write a message…" pill that edits it.
 * 2. Edit     the edit button makes it the Composer: it is its editing
 *             size at once and takes focus in the same tap, so the
 *             on-screen keyboard rises. Focus leaving it makes it read
 *             only again, two lines tall. Nothing in it moves while it
 *             has focus.
 * 3. Row      under it: `+`, a Drawer to attach a file or a photo or to
 *             choose the microphone; the model chip; in the centre, the
 *             largest, the microphone, which starts and stops a
 *             Dictation; the skills Picker, next largest; and Send once
 *             there is something to send. While it is edited the row is
 *             only `+`, the microphone and Send, and the microphone and
 *             Send leave focus where it is.
 * 4. Dictate  while one records, the line over it says so. As it stops,
 *             the Draft scrolls to where its text will go and says
 *             "Transcribing…" there; its text then fades in, unless the
 *             Composer has focus (`styles.css`).
 */

/** One line of its text, at 16px and 1.75 line height. */
const LINE = 28;

export function TouchCard({
  draft,
  chip,
  send,
  actions,
}: {
  readonly draft: Draft;
  /** The model chip. */
  readonly chip: ReactNode;
  /** The send button, drawn once there is something to send. */
  readonly send: ReactNode;
  /** What the page adds, such as Stop. */
  readonly actions?: ReactNode;
}) {
  const { onShown, recording } = draft.dictation;
  useEffect(onShown, [onShown]);
  const [expanded, setExpanded] = useState(false);
  const more = useMoreThan(draft.parent, 2 * LINE);
  const editing = draft.writing;
  const resting = !editing && draft.empty;
  const scroller = useRef<HTMLDivElement>(null);
  // Two lines tall, it is clipped, not scrolled, and shows whole lines:
  // `shift` of them are above it.
  const collapsed = !editing && !expanded;
  const [shift, setShift] = useState(0);
  const settle = () => {
    setExpanded(false);
    setShift(0);
  };
  useEffect(() => {
    if (draft.empty) setShift(0);
  }, [draft.empty]);

  // 4. Dictate: where its text goes is brought into view, smoothly unless
  // the Composer has focus or motion is reduced.
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
      const still =
        editing || matchMedia('(prefers-reduced-motion: reduce)').matches;
      spot.scrollIntoView({
        block: 'nearest',
        behavior: still ? 'auto' : 'smooth',
      });
    };
    return () => void (draft.reveal.current = null);
  });

  // 2. Edit: at its editing size, and as that changes, such as when the
  // on-screen keyboard rises, the cursor is kept in view.
  useEffect(() => {
    const box = scroller.current;
    if (!editing || box === null) return;
    const follow = () => {
      const view = draft.view.current;
      view?.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main.head, {
          y: 'nearest',
          yMargin: 8,
        }),
      });
    };
    const observer = new ResizeObserver(follow);
    observer.observe(box);
    return () => observer.disconnect();
  }, [editing]);

  return (
    <div className="flex flex-col gap-2">
      {actions !== undefined && actions !== false && (
        <div className="flex justify-end">{actions}</div>
      )}
      <div
        data-slot="draft"
        data-touch=""
        data-writing={editing || undefined}
        data-recording={recording !== null || undefined}
        data-disabled={draft.disabled || undefined}
        className="group/draft flex flex-col gap-1 rounded-[1.75rem] border border-border bg-card p-1.5 data-recording:border-destructive/35 data-writing:border-primary/50"
      >
        {recording !== null && (
          <div className="-mb-1">
            <Heading draft={draft} />
          </div>
        )}
        <div className="relative flex min-w-0 items-start">
          <div
            ref={scroller}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                settle();
                draft.leave();
              }
            }}
            className={cn(
              'relative min-w-0 flex-1 px-3 text-foreground group-data-disabled/draft:opacity-40',
              // Scrolled, the text fades under the card's top and bottom
              // edges, in the padding, rather than being cut there.
              (editing || expanded) &&
                'max-h-[min(40dvh,20rem)] overflow-y-auto overscroll-contain py-3 [mask-image:linear-gradient(to_bottom,transparent,black_0.75rem,black_calc(100%-0.75rem),transparent)]',
              editing
                ? 'min-h-[calc(4*1.75rem+1.5rem)]'
                : expanded
                  ? ''
                  : resting
                    ? 'my-2 h-8 overflow-clip'
                    : 'my-2 h-14 overflow-clip',
            )}
          >
            {editing && draft.empty && (
              <p
                aria-hidden
                className="pointer-events-none absolute inset-x-3 top-3 truncate text-base leading-[1.75] text-muted-foreground/70"
              >
                {draft.placeholder}
              </p>
            )}
            {/* 1. Rest: read only, its words take no tap. */}
            <div
              ref={draft.parent}
              style={
                collapsed && shift > 0
                  ? { transform: `translateY(${-shift * LINE}px)` }
                  : undefined
              }
              className={cn(
                'relative',
                !editing && 'pointer-events-none',
                resting && 'opacity-0',
                collapsed &&
                  'transition-transform duration-300 ease-out motion-reduce:transition-none',
              )}
            />
          </div>
          {resting ? (
            <button
              type="button"
              onClick={draft.write}
              disabled={draft.disabled}
              className="absolute inset-0 flex items-center gap-2 rounded-full bg-muted/60 pr-2 pl-4 text-left text-base text-muted-foreground transition-colors duration-150 active:bg-muted motion-reduce:transition-none"
            >
              <span className="min-w-0 flex-1 truncate">Write a message…</span>
              <PencilIcon aria-hidden className="size-4.5 shrink-0" />
            </button>
          ) : (
            !editing && (
              <div className="flex shrink-0 flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Edit the message"
                  disabled={draft.disabled}
                  onClick={draft.write}
                  className={SIDE}
                >
                  <PencilIcon aria-hidden />
                </Button>
                {(more || expanded) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={expanded ? 'Show two lines' : 'Show all of it'}
                    aria-expanded={expanded}
                    onClick={() => (expanded ? settle() : setExpanded(true))}
                    className={SIDE}
                  >
                    {expanded ? (
                      <ChevronsDownUpIcon aria-hidden />
                    ) : (
                      <ChevronsUpDownIcon aria-hidden />
                    )}
                  </Button>
                )}
              </div>
            )
          )}
        </div>
        {(draft.attachments.length > 0 || draft.files.refused.length > 0) && (
          <div className="px-2">
            <AttachmentStrip
              attachments={draft.attachments}
              refused={draft.files.refused}
              disabled={draft.disabled}
              onRemove={draft.files.remove}
            />
          </div>
        )}
        <Row draft={draft} chip={chip} send={send} />
      </div>
    </div>
  );
}

// 36px drawn, 44px to tap: the two share the height of two lines.
const SIDE =
  'relative size-9 rounded-full text-muted-foreground before:absolute before:-inset-1 before:content-[""] aria-expanded:bg-transparent';

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

/**
 * Keeps focus where it is on a tap: the Composer stays the Composer, and
 * its keyboard stays up, as the microphone or Send is pressed.
 */
const keepFocus = (event: { preventDefault: () => void }) =>
  event.preventDefault();

/** 3. Row: `+` and the chip, the microphone in the centre, then the skills and Send. */
function Row({
  draft,
  chip,
  send,
}: {
  readonly draft: Draft;
  readonly chip: ReactNode;
  readonly send: ReactNode;
}) {
  const editing = draft.writing;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
      <div className="flex min-w-0 items-center gap-0.5">
        <Add draft={draft} />
        {!editing && chip}
      </div>
      <Microphone draft={draft} />
      <div
        className="flex min-w-0 items-center justify-end gap-1"
        onMouseDown={editing ? keepFocus : undefined}
      >
        {!editing && <Skills draft={draft} />}
        {draft.filled && send}
      </div>
    </div>
  );
}

/** The centre of the row, and its largest button: start or stop a Dictation. */
function Microphone({ draft }: { readonly draft: Draft }) {
  const { recording, onToggle } = draft.dictation;
  const label = recording !== null ? 'Stop the Dictation' : 'Dictate';
  return (
    <Button
      type="button"
      variant={recording !== null ? 'destructive' : 'default'}
      size="icon"
      aria-label={label}
      data-slot="dictate"
      onMouseDown={draft.writing ? keepFocus : undefined}
      onClick={onToggle}
      className={cn(
        'shrink-0 rounded-full transition-[background-color,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none',
        draft.writing
          ? 'size-12 [&_svg:not([class*=size-])]:size-5'
          : 'size-14 [&_svg:not([class*=size-])]:size-6',
      )}
    >
      {recording !== null ? (
        <SquareIcon aria-hidden className="size-4.5! fill-current" />
      ) : (
        <MicIcon aria-hidden />
      )}
    </Button>
  );
}

/** The skills Picker, in a Dialog: the next largest button. */
function Skills({ draft }: { readonly draft: Draft }) {
  return (
    <Picker.Frame
      how={draft.skills.how}
      mode="dialog"
      label="Skills and commands"
      onOpen={() => draft.skills.onOpen('pointer', false)}
      trigger={
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Add a skill or command"
          disabled={draft.disabled || !draft.skills.offered}
          className="size-12 shrink-0 rounded-full text-muted-foreground [&_svg:not([class*=size-])]:size-5"
        >
          {/* A skill is typed after a slash: the button shows one. */}
          <span aria-hidden className="font-mono text-xl leading-none">
            /
          </span>
        </Button>
      }
    >
      {draft.skills.picker}
    </Picker.Frame>
  );
}

/**
 * `+`: a Drawer to attach a file or a photo, or to choose the microphone.
 * The file fields stay outside it, so a file picked after it closed still
 * arrives.
 */
function Add({ draft }: { readonly draft: Draft }) {
  const [open, setOpen] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const pick = (input: RefObject<HTMLInputElement | null>) => {
    input.current?.click();
    setOpen(false);
  };
  const field = (ref: RefObject<HTMLInputElement | null>, accept?: string) => (
    <input
      ref={ref}
      type="file"
      multiple
      hidden
      tabIndex={-1}
      {...(accept === undefined ? {} : { accept })}
      onChange={(event) => {
        void draft.files.add([...(event.currentTarget.files ?? [])]);
        event.currentTarget.value = '';
      }}
    />
  );
  return (
    <>
      {field(files)}
      {field(photos, 'image/*')}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Add to the message"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={draft.disabled}
        onClick={() => setOpen(true)}
        className="size-11 shrink-0 rounded-full text-muted-foreground [&_svg:not([class*=size-])]:size-5"
      >
        <PlusIcon aria-hidden />
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => setOpen(next)}
        label="Add to the message"
      >
        <LayerHeader title="Add to the message" />
        <div className="flex flex-col pb-2">
          <AddRow icon={<PaperclipIcon />} onClick={() => pick(files)}>
            Attach a file
          </AddRow>
          <AddRow icon={<ImageIcon />} onClick={() => pick(photos)}>
            Add a photo
          </AddRow>
          {draft.dictation.onChooseMicrophone !== undefined && (
            <AddRow
              icon={<MicIcon />}
              more
              onClick={() => {
                setOpen(false);
                draft.dictation.onChooseMicrophone?.();
              }}
            >
              Choose the microphone
            </AddRow>
          )}
        </div>
      </Drawer>
    </>
  );
}

function AddRow({
  icon,
  onClick,
  more = false,
  children,
}: {
  readonly icon: ReactNode;
  readonly onClick: () => void;
  /** It opens something more. */
  readonly more?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-base transition-colors duration-150 active:bg-muted motion-reduce:transition-none [&>svg:first-child]:size-5 [&>svg:first-child]:text-muted-foreground"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {more && (
        <ChevronRightIcon
          aria-hidden
          className="size-4 text-muted-foreground/70"
        />
      )}
    </button>
  );
}
