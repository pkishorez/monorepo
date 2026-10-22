import { Button } from '@kestack/web-platform/components/button';
import { SquareSlashIcon } from '@kestack/web-platform/components/lucide';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { keys } from '../keys.ts';
import {
  AttachButton,
  AttachmentStrip,
  useAttachments,
  type Attachment,
} from './attachments/index.ts';
import { insertSlash, slashAtoms, useEditor } from './editor/index.ts';
import { Palette, type PaletteEntry } from './palette/index.ts';

/*
 * Where a message is written. Its text and files belong to the parent,
 * which also decides what sending means. Enter or Cmd/Ctrl+Enter sends,
 * as does any submit button in `actions`; Shift+Enter is a new line.
 *
 * The box is part of the page's Surface: `i` from the page starts writing
 * in it, Enter and Shift+Enter stay CodeMirror's, and Escape leaves it for
 * the page's Normal Mode. While it is written in, its border lights up.
 *
 * Over the text is a row of shortcuts, Skills first. It and a `/` at the
 * start of a word open the palette of skills and commands, the `palette`
 * Surface, which is open while it is Active; the one picked
 * goes in as a `/name` chip, which the cursor steps over and Backspace
 * removes whole. Escape leaves the typed `/` as it is. Picked or not, the
 * palette gives the editor its focus back if it had it. Files come by
 * paste, drop, or the paperclip.
 *
 * The bottom row never wraps: it is a container, and its controls give up
 * their words before their place as it narrows.
 */

const none: ReadonlyArray<PaletteEntry> = [];

export function Composer({
  label,
  placeholder,
  text,
  onTextChange,
  attachments,
  onAttachmentsChange,
  onSubmit,
  skills,
  skillsLoading = false,
  skillsProblem = null,
  onPaletteOpen,
  commands = none,
  disabled = false,
  autoFocus = false,
  describedBy,
  toolbar,
  actions,
}: {
  /** What the editor is called to a screen reader. */
  readonly label: string;
  readonly placeholder: string;
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  readonly attachments: ReadonlyArray<Attachment>;
  readonly onAttachmentsChange: (
    attachments: ReadonlyArray<Attachment>,
  ) => void;
  /** Called only when there is text or a file to send. */
  readonly onSubmit: () => void;
  readonly skills: ReadonlyArray<PaletteEntry>;
  /** The skills are still being read; the palette opens and says so. */
  readonly skillsLoading?: boolean;
  /** Why the skills could not be read; the palette says so. */
  readonly skillsProblem?: string | null;
  /** The palette opened, so skills that failed to load can be read again. */
  readonly onPaletteOpen?: () => void;
  /** More `/` entries that are not skills, such as `btw`. */
  readonly commands?: ReadonlyArray<PaletteEntry>;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  /** The id of a line that explains the editor's state, such as being offline. */
  readonly describedBy?: string;
  /**
   * Controls on the left of the bottom row, after the paperclip. They
   * share what width is left, so each should be able to shrink.
   */
  readonly toolbar?: ReactNode;
  /** Buttons on the right of the bottom row; a `type="submit"` one sends. */
  readonly actions?: ReactNode;
}) {
  const names = [...commands, ...skills].map(({ name }) => name).join('\n');
  const known = useMemo(() => slashAtoms(new Set(names.split('\n'))), [names]);
  const empty =
    !skillsLoading &&
    skillsProblem === null &&
    commands.length === 0 &&
    skills.length === 0;
  const { enter, leave } = keys.useKeyboard();
  /** Where the `/` that opened the palette is, if one did. */
  const [slashAt, setSlashAt] = useState<number | null>(null);
  /** Whether the editor had focus as the palette opened. */
  const writing = useRef(false);
  const openPalette = (at: number | null) => {
    setSlashAt(at);
    writing.current = editor.view.current?.hasFocus ?? false;
    enter('palette');
    onPaletteOpen?.();
  };
  // After the dialog has put focus back where it was, so this one wins.
  const backToEditor = () => {
    if (!writing.current) return;
    writing.current = false;
    requestAnimationFrame(() => editor.view.current?.focus());
  };

  const files = useAttachments({
    attachments,
    onChange: onAttachmentsChange,
    disabled,
  });

  const send = () => {
    const written = editor.view.current?.state.doc.toString() ?? text;
    if (disabled || (written.trim() === '' && attachments.length === 0)) return;
    files.settle();
    onSubmit();
  };

  const editor = useEditor({
    text,
    onTextChange,
    onSend: send,
    onPasteFiles: (pasted) => void files.add(pasted),
    label,
    describedBy,
    placeholder,
    disabled,
    autoFocus,
    atoms: known,
    onSlash: (at) => {
      if (!empty) openPalette(at);
    },
  });

  keys.useAction('content.write', () => editor.view.current?.focus());

  return (
    <form
      className="@container/composer flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div
        {...files.dropZone}
        data-slot="composer"
        data-disabled={disabled || undefined}
        className="relative flex flex-col rounded-xl border border-input bg-card shadow-xs transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none has-[.cm-focused]:border-ring has-[.cm-focused]:ring-3 has-[.cm-focused]:ring-ring/50 data-dragging:border-ring data-dragging:ring-3 data-dragging:ring-ring/50 data-disabled:opacity-60"
      >
        <div className="flex items-center gap-1 px-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            title="Add a skill or command (/)"
            disabled={disabled || empty}
            className="text-muted-foreground"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openPalette(null)}
          >
            <SquareSlashIcon aria-hidden />
            Skills
          </Button>
        </div>
        <AttachmentStrip
          attachments={attachments}
          refused={files.refused}
          disabled={disabled}
          onRemove={files.remove}
        />
        <div ref={editor.parent} className="min-h-11" />
        <div
          className="flex min-w-0 items-center gap-1 px-2 pt-1 pb-2"
          onMouseDown={(event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            editor.view.current?.focus();
          }}
        >
          <AttachButton
            disabled={disabled}
            onFiles={(picked) => void files.add(picked)}
          />
          {toolbar !== undefined && (
            <div className="flex min-w-0 flex-1 items-center gap-0.5">
              {toolbar}
            </div>
          )}
          {actions !== undefined && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {actions}
            </div>
          )}
        </div>
        {files.dropZone['data-dragging'] && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-background/85 text-sm text-muted-foreground"
          >
            Drop files to attach
          </div>
        )}
      </div>
      <Palette
        commands={commands}
        skills={skills}
        loading={skillsLoading}
        problem={skillsProblem}
        onPick={(name) => {
          leave('palette');
          const view = editor.view.current;
          if (view !== null) insertSlash(view, name, slashAt);
        }}
        onClose={backToEditor}
      />
    </form>
  );
}
