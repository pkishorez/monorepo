import { Button } from '@kestack/web-platform/components/button';
import {
  MicIcon,
  SquareSlashIcon,
} from '@kestack/web-platform/components/lucide';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { keys, useBound, useTypingKeys } from '../../../../keys.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import {
  AttachButton,
  AttachmentStrip,
  useAttachments,
  type Attachment,
} from './attachments/index.ts';
import { slashAtoms, useEditor } from './editor/index.ts';
import type { Insert } from './message.ts';
import { useTransfers } from './transfer.ts';

/*
 * The Draft's card and its editing: the message as it will be sent, at
 * the page's foot. Its text and files are the Draft Actor's
 * (`actor.ts`), which also decides what sending means; its cursor,
 * selection and history are its editor's.
 *
 * 1. Read     in Vim Mode it can be scrolled, clicked to place the cursor
 *             and dragged to select, but not typed into; Enter sends it,
 *             from the page's Normal Mode. Out of Vim Mode it is always
 *             the Composer, as a text box is. In an untouched Draft the
 *             cursor is at the end.
 * 2. Write    `i`, or a tap, makes it the Composer in place: typed into,
 *             Enter or Mod+Enter sending, Shift+Enter a new line. Escape,
 *             as any move to the page's Normal Mode, makes it read only
 *             again, keeping its text, cursor and selection.
 * 3. Insert   everything put in goes in at the cursor, over the selection:
 *             a paste or a drop anywhere on the page (`transfer.ts`), and a
 *             Skill from the skills Picker, opened by `/` from Normal Mode,
 *             by a `/` typed at the start of a word in the Composer, or by
 *             its button. Each is a message to the Draft, which hands back
 *             the Insert, numbered, for the editor to put in once; files are
 *             attached instead. After each the cursor is after it, the page
 *             scrolls it into view, and it fades from a highlight.
 * 4. Dictate  while a Dictation records, the line over the Draft shows it
 *             in place of "Draft": the time, a level, the microphone and
 *             the keys to stop it or change microphone. One stopped while
 *             this Draft was open says it is being written out, there and
 *             as a placeholder where the cursor was, "transcribing…",
 *             until its text goes in there as any insert does, and the
 *             Draft says it took it; refused, the placeholder offers a
 *             retry.
 * 5. Undo     `u`, or Mod+Z in the Composer, takes the last step back.
 *
 * Under it is its Status Line: the model and its settings, the skills,
 * the paperclip and the mic, and the send buttons.
 */

interface DraftOptions {
  /** What the editor is called to a screen reader. */
  readonly label: string;
  /** What the empty Composer says. */
  readonly placeholder: string;
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  readonly attachments: ReadonlyArray<Attachment>;
  readonly onAttachmentsChange: (
    attachments: ReadonlyArray<Attachment>,
  ) => void;
  /** The last Insert the page handed back, or null before any. */
  readonly insert: typeof Insert.Schema.Type | null;
  /** Asks the page to put `what` in: it hands back the next Insert. */
  readonly onInsert: (what: typeof Insert.What.Type) => void;
  /** Called only when there is text or a file to send. */
  readonly onSend: () => void;
  /** The skills and commands a `/name` in the text is drawn as a chip for. */
  readonly known: ReadonlyArray<string>;
  /** The skills Picker the page keeps. */
  readonly skills: {
    /** How it is open, or null while it is not. */
    readonly how: typeof Picker.How.Type | null;
    /** Whether it has anything to offer, or to say: loading, or why not. */
    readonly offered: boolean;
    /** Open it, to put a skill in at the cursor, on a `/` typed there or not. */
    readonly onOpen: (how: typeof Picker.How.Type, typed: boolean) => void;
    /** Its View, while it is open. */
    readonly picker: ReactNode;
  };
  /** The app's Dictation, as this Draft sees it. */
  readonly dictation: {
    /**
     * The one recording now, if any, wherever its text goes: the
     * microphone opening, or recording, with the name of the one heard and
     * its clock and meter to draw, which draw again on their own.
     */
    readonly recording:
      | { readonly _tag: 'Starting' }
      | {
          readonly _tag: 'Recording';
          readonly microphone: string;
          readonly elapsed: ReactNode;
          readonly level: ReactNode;
        }
      | null;
    /** The one coming to this Draft, if any: on its way, refused, or its text. */
    readonly pending:
      | { readonly _tag: 'Transcribing'; readonly id: number }
      | {
          readonly _tag: 'Failed';
          readonly id: number;
          readonly reason: string;
        }
      | { readonly _tag: 'Text'; readonly id: number; readonly text: string }
      | null;
    /** Start one, or stop the one recording. */
    readonly onToggle: () => void;
    /** Its text is in. */
    readonly onTook: (id: number) => void;
    readonly onRetry: (id: number) => void;
    /** Called while the Draft is on screen; what it returns, once it is not. */
    readonly onShown: () => () => void;
    /** The button beside the mic that chooses the microphone. */
    readonly microphones?: ReactNode;
  };
  readonly disabled?: boolean;
  /** The id of a line that explains the editor's state, such as being offline. */
  readonly describedBy?: string;
}

/**
 * The Draft's editing, for `Card` and `StatusLine` to draw: its editor,
 * its keys, and what is pasted or dropped on the page.
 */
export function useDraft(options: DraftOptions) {
  const {
    text,
    attachments,
    insert,
    onInsert,
    onSend,
    known,
    skills,
    dictation,
    disabled = false,
  } = options;
  const names = known.join('\n');
  const atoms = useMemo(() => slashAtoms(new Set(names.split('\n'))), [names]);
  const open = Picker.useOpen();
  const composer = keys.useFocusSpot('content', 'composer');
  const typingKeys = useTypingKeys();
  const [composing, setWriting] = useState(false);
  const surface = keys.useSurface('content');
  // Out of Vim Mode it is always the Composer, as any text box is.
  const { vim } = keys.useKeyboard();
  const writing = composing || !vim.on;
  const files = useAttachments({
    attachments,
    onChange: options.onAttachmentsChange,
    disabled,
  });

  const filled = text.trim() !== '' || attachments.length > 0;
  const send = () => {
    const written = editor.view.current?.state.doc.toString() ?? text;
    if (disabled || (written.trim() === '' && attachments.length === 0)) return;
    files.settle();
    onSend();
  };

  const writeKeys = useBound('content.write');
  // In Vim Mode, read only, it says how to write in it.
  const reading =
    writeKeys === null ? 'Write a message' : `Press ${writeKeys} to write`;
  const placeholder = writing ? options.placeholder : reading;

  const latest = useRef(dictation);
  latest.current = dictation;
  const editor = useEditor({
    text,
    onTextChange: options.onTextChange,
    onSend: send,
    label: options.label,
    describedBy: options.describedBy,
    placeholder,
    disabled,
    writing,
    spot: composer,
    atoms,
    typingKeys,
    onSlash: () => {
      if (!skills.offered) return;
      open(() => skills.onOpen('keys', true));
    },
    onRetry: (id) => latest.current.onRetry(id),
  });

  // 2. Write: back in the page's Normal Mode, it is read only again.
  useEffect(() => {
    if (vim.on && surface.active && surface.mode === 'normal')
      setWriting(false);
  }, [vim.on, surface.active, surface.mode]);

  const write = () => {
    if (disabled) return;
    editor.write();
    setWriting(true);
  };

  // 3. Insert: each Insert the page hands back goes in once.
  const inserted = useRef(insert?.id ?? 0);
  useEffect(() => {
    if (insert === null || insert.id <= inserted.current) return;
    inserted.current = insert.id;
    editor.insert(insert.what);
  }, [insert]);

  // 4. Dictate: its text goes in once, as it is there to take.
  const took = useRef<number | null>(null);
  const { pending } = dictation;
  useEffect(() => {
    if (pending === null) return editor.awaiting(null);
    if (pending._tag !== 'Text')
      return editor.awaiting({
        id: pending.id,
        failed: pending._tag === 'Failed',
        reason: pending._tag === 'Failed' ? pending.reason : null,
      });
    if (took.current === pending.id) return;
    const { id, text } = pending;
    if (!editor.insert({ _tag: 'Dictated', id, text })) return;
    took.current = pending.id;
    latest.current.onTook(pending.id);
  }, [pending?._tag, pending?.id, disabled]);

  const { dragging } = useTransfers({
    own: () => editor.view.current?.dom ?? null,
    disabled,
    onText: (text) => onInsert({ _tag: 'Text', text }),
    onFiles: (pasted) => void files.add(pasted),
  });

  keys.useAction('content.write', write, { enabled: !disabled });
  keys.useAction('content.send', send, { enabled: filled && !disabled });
  // 5. Undo
  keys.useAction('content.undo', editor.undo, { enabled: !disabled });
  keys.useAction(
    'content.skills',
    () => open(() => skills.onOpen('keys', false)),
    {
      enabled: skills.offered && !disabled,
    },
  );

  return {
    parent: editor.parent,
    vim: vim.on,
    placeholder,
    /** Nothing in it yet, nor a Dictation coming: its placeholder shows. */
    empty: text === '' && dictation.pending === null,
    writing,
    dragging,
    disabled,
    filled,
    attachments,
    files,
    skills,
    dictation,
    send,
    write,
  };
}

type Draft = ReturnType<typeof useDraft>;

/**
 * The Draft, at the page's foot: one card with the message as it will be
 * sent, its files, and under them `children`, the Status Line. It stays
 * put while the transcript scrolls above it; a long Draft scrolls inside
 * it. Read only, it recedes: dashed, flat, its words muted. As the
 * Composer it comes forward: solid, raised and ringed, its words in full,
 * and the line over it says which it is and the key that changes it.
 * While a Dictation records, its border is tinted and that line shows the
 * Dictation instead; while one is written out for it, it says so.
 */
export function Card({
  draft,
  children,
}: {
  readonly draft: Draft;
  readonly children?: ReactNode;
}) {
  const { onShown, recording } = draft.dictation;
  useEffect(onShown, [onShown]);
  return (
    <div
      data-slot="draft"
      data-recording={recording !== null || undefined}
      data-writing={(draft.vim && draft.writing) || undefined}
      data-plain={!draft.vim || undefined}
      data-dragging={draft.dragging || undefined}
      data-disabled={draft.disabled || undefined}
      className="group/draft relative flex flex-col rounded-xl border border-dashed border-border bg-muted/30 transition-[border-color,background-color,box-shadow] duration-150 ease-out motion-reduce:transition-none data-dragging:border-solid data-dragging:border-ring data-writing:border-solid data-writing:border-primary/60 data-writing:bg-card data-writing:shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.08),0_16px_40px_rgb(0_0_0/0.12)] data-writing:ring-4 data-writing:ring-primary/10 data-recording:not-data-writing:border-solid data-recording:not-data-writing:border-destructive/35 data-plain:border-solid data-plain:bg-card data-plain:focus-within:border-primary/60 data-plain:focus-within:ring-4 data-plain:focus-within:ring-primary/10"
    >
      <Heading draft={draft} />
      <div
        // A tap has no `i` to press: on a touch screen it writes.
        onPointerUp={(event) => {
          if (event.pointerType === 'touch' && !draft.writing) draft.write();
        }}
        className="flex flex-col gap-3 px-4 pt-1.5 pb-1 text-muted-foreground transition-colors duration-150 group-data-writing/draft:text-foreground group-data-disabled/draft:opacity-40 motion-reduce:transition-none"
      >
        {/*
         * The placeholder sits behind the editor, never in its text, so the
         * cursor of an empty Draft is at its start, as in any text box.
         */}
        <div className="relative max-h-[min(40dvh,20rem)] min-h-7 overflow-y-auto">
          {draft.empty && (
            <p
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 truncate text-base leading-[1.75] text-muted-foreground/70"
            >
              {draft.placeholder}
            </p>
          )}
          <div ref={draft.parent} className="relative" />
        </div>
        <AttachmentStrip
          attachments={draft.attachments}
          refused={draft.files.refused}
          disabled={draft.disabled}
          onRemove={draft.files.remove}
        />
      </div>
      {children !== undefined && <div className="px-2 pb-2">{children}</div>}
      {draft.dragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-background/85 text-sm text-muted-foreground"
        >
          Drop to add it to the message
        </div>
      )}
    </div>
  );
}

const HEADING =
  'flex min-w-0 items-center gap-1.5 px-4 pt-2.5 text-[11px] leading-4 font-medium tracking-[0.08em] text-muted-foreground uppercase';
const HINT = 'ml-auto shrink-0 pl-2 font-normal tracking-normal normal-case';

/**
 * The line over the Draft: which it is, Draft or Editing, and the key that
 * changes it; while a Dictation records, the Dictation, and while one is
 * written out for this Draft, that it is coming.
 */
function Heading({ draft }: { readonly draft: Draft }) {
  const writeKeys = useBound('content.write');
  const dictateKeys = useBound('app.dictate');
  const microphoneKeys = useBound('app.microphone');
  const { recording, pending } = draft.dictation;
  if (recording !== null)
    return (
      <div data-slot="dictation" className={HEADING}>
        <span
          aria-hidden
          className="size-1.5 shrink-0 animate-breathe rounded-full bg-destructive motion-reduce:animate-none"
        />
        {recording._tag === 'Starting' ? (
          <span
            role="status"
            className="font-normal tracking-normal normal-case"
          >
            Opening the microphone…
          </span>
        ) : (
          <>
            <span role="status" className="text-foreground">
              Recording
            </span>
            <span className="font-normal tracking-normal text-foreground">
              {recording.elapsed}
            </span>
            {recording.level}
            <span
              title={recording.microphone}
              className="min-w-0 truncate font-normal tracking-normal normal-case"
            >
              {recording.microphone}
            </span>
          </>
        )}
        <span aria-hidden className={HINT}>
          {[
            dictateKeys === null ? null : `${dictateKeys} to stop`,
            microphoneKeys === null ? null : `${microphoneKeys} microphone`,
          ]
            .filter((hint) => hint !== null)
            .join(' · ')}
        </span>
      </div>
    );
  if (pending?._tag === 'Transcribing')
    return (
      <div data-slot="dictation" className={HEADING}>
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
        />
        <span role="status" className="font-normal tracking-normal normal-case">
          Transcribing…
        </span>
      </div>
    );
  // Out of Vim Mode it is a plain message box: no Mode to say.
  if (!draft.vim)
    return (
      <div aria-hidden className={HEADING}>
        <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
        <span>Message</span>
        <span className={HINT}>Shift+Enter for a new line</span>
      </div>
    );
  return (
    <div aria-hidden className={HEADING}>
      <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40 transition-colors duration-150 group-data-writing/draft:bg-primary motion-reduce:transition-none" />
      <span className="group-data-writing/draft:text-foreground">
        {draft.writing ? 'Editing' : 'Draft'}
      </span>
      <span className={HINT}>
        {draft.writing
          ? 'Esc when done'
          : writeKeys === null
            ? null
            : `${writeKeys} to edit`}
      </span>
    </div>
  );
}

/**
 * The Status Line, the one line at the foot of the Draft: the model and its
 * settings in `children`, the skills, the paperclip and the mic, which
 * starts or stops a Dictation, with the button beside it that chooses
 * the microphone, and on the right
 * the page's `actions`, such as its send button. It never wraps: it is a
 * container, and its controls give up their words before their place as
 * it narrows.
 */
export function StatusLine({
  draft,
  children,
  actions,
}: {
  readonly draft: Draft;
  /** The model and its settings: they share what width is left. */
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}) {
  const skillKeys = useBound('content.skills');
  const dictateKeys = useBound('app.dictate');
  const { recording, onToggle, microphones } = draft.dictation;
  const dictate = recording !== null ? 'Stop the Dictation' : 'Dictate';
  return (
    <div className="@container/status flex min-w-0 items-center gap-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        {children}
        <Picker.Frame
          how={draft.skills.how}
          label="Skills and commands"
          onOpen={() => draft.skills.onOpen('pointer', false)}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Add a skill or command"
              title={
                skillKeys === null
                  ? 'Add a skill or command'
                  : `Add a skill or command (${skillKeys})`
              }
              disabled={draft.disabled || !draft.skills.offered}
              className="shrink-0 text-muted-foreground"
            >
              <SquareSlashIcon aria-hidden />
            </Button>
          }
          side="top"
          className="w-[min(26rem,calc(100vw-2rem))]"
        >
          {draft.skills.picker}
        </Picker.Frame>
        <AttachButton
          disabled={draft.disabled}
          onFiles={(picked) => void draft.files.add(picked)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={dictate}
          title={dictateKeys === null ? dictate : `${dictate} (${dictateKeys})`}
          onClick={onToggle}
          data-recording={recording !== null || undefined}
          className="shrink-0 text-muted-foreground data-recording:text-destructive"
        >
          <MicIcon aria-hidden />
        </Button>
        {microphones}
      </div>
      {actions !== undefined && (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions}
        </div>
      )}
    </div>
  );
}
