import { Button } from '@kestack/web-platform/components/button';
import { SquareSlashIcon } from '@kestack/web-platform/components/lucide';
import { useMemo, useRef, type ReactNode } from 'react';
import {
  AttachButton,
  AttachmentStrip,
  useAttachments,
  type Attachment,
} from './attachments/index.ts';
import { useEditor } from './editor/index.ts';
import { openSlashMenu, slashMenu } from './slash-menu/index.ts';

/*
 * Where a message is written. Its text and files belong to the parent,
 * which also decides what sending means. Enter or Cmd/Ctrl+Enter sends,
 * as does any submit button in `actions`; Shift+Enter is a new line.
 * `/` at the start of a word opens the skills and commands; a known
 * `/name` reads as a chip. Files come by paste, drop, or the paperclip.
 */

interface SlashEntry {
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string | undefined;
}

const none: ReadonlyArray<SlashEntry> = [];

export function Composer({
  label,
  placeholder,
  text,
  onTextChange,
  attachments,
  onAttachmentsChange,
  onSubmit,
  skills,
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
  readonly skills: ReadonlyArray<SlashEntry>;
  /** More `/` entries that are not skills, such as `btw`. */
  readonly commands?: ReadonlyArray<SlashEntry>;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  /** The id of a line that explains the editor's state, such as being offline. */
  readonly describedBy?: string;
  /** Controls on the left of the bottom row, after the paperclip and `/`. */
  readonly toolbar?: ReactNode;
  /** Buttons on the right of the bottom row; a `type="submit"` one sends. */
  readonly actions?: ReactNode;
}) {
  const entries = useMemo(() => [...commands, ...skills], [commands, skills]);
  const current = useRef(entries);
  current.current = entries;
  const menu = useMemo(() => slashMenu(() => current.current), []);
  const tokens = useMemo(
    () => new Set(entries.map(({ name }) => name)),
    [entries],
  );

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
    tokens,
    extensions: menu,
  });

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div
        {...files.dropZone}
        data-disabled={disabled || undefined}
        className="relative flex flex-col rounded-xl border border-input bg-card shadow-xs transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none has-[.cm-focused]:border-ring has-[.cm-focused]:ring-3 has-[.cm-focused]:ring-ring/50 data-dragging:border-ring data-dragging:ring-3 data-dragging:ring-ring/50 data-disabled:opacity-60"
      >
        <AttachmentStrip
          attachments={attachments}
          refused={files.refused}
          disabled={disabled}
          onRemove={files.remove}
        />
        <div ref={editor.parent} className="min-h-11" />
        <div
          className="flex items-center gap-1 px-2 pt-1 pb-2"
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
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Insert a skill"
            title="Insert a skill"
            disabled={disabled || entries.length === 0}
            className="text-muted-foreground"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const view = editor.view.current;
              if (view !== null) openSlashMenu(view);
            }}
          >
            <SquareSlashIcon aria-hidden />
          </Button>
          {toolbar !== undefined && (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
              {toolbar}
            </div>
          )}
          {actions !== undefined && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 self-end">
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
    </form>
  );
}
