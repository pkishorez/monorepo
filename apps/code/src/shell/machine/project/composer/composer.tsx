import { Schema } from 'effect';
import type { Effect } from 'effect';
import { AttachmentSchema, SkillSchema } from '@kestack/ai-toolkit/api';
import { Button } from '@kestack/web-platform/components/button';
import { SquareSlashIcon } from '@kestack/web-platform/components/lucide';
import { useMemo, type ReactNode } from 'react';
import { keys, useTypingKeys } from '../../../../keys.ts';
import * as Picker from '../../../../ui/picker/index.ts';
import {
  AttachButton,
  AttachmentStrip,
  useAttachments,
  type Attachment,
} from './attachments/index.ts';
import { slashAtoms, useEditor, withSlash } from './editor/index.ts';

/*
 * Where a message is written. Its text and files belong to the page that
 * draws it, which also decides what sending means. Enter or Cmd/Ctrl+Enter
 * sends, as does any submit button in `actions`; Shift+Enter is a new line.
 *
 * The editor is part of the page's Surface and its default Focus Spot:
 * coming back to the page, from a Picker, the sidebar or another session,
 * puts focus back in it. `i` from the page starts writing in it, and Escape
 * leaves it for the page's Normal Mode. While it is written in, its border
 * lights up.
 *
 * Over the text is a row of shortcuts, Skills first. It and a `/` at the
 * start of a word open the skills Picker, which the page keeps; the one
 * picked goes into the page's text as a `/name` chip, which the cursor
 * steps over and Backspace removes whole. Escape leaves the typed `/` as it
 * is. Files come by paste, drop, or the paperclip.
 *
 * The bottom row never wraps: it is a container, and its controls give up
 * their words before their place as it narrows.
 */

/** A file on a message being written: what is sent, and its size to show. */
export const Attached = Schema.Struct({
  ...AttachmentSchema.fields,
  size: Schema.Finite,
});

/** Files as they are sent: without the sizes only the composer shows. */
export const wire = (attached: ReadonlyArray<typeof Attached.Type>) =>
  attached.map(({ name, mime, data }) => ({ name, mime, data }));

const Listing = Schema.Struct({
  /** `/` entries that are not skills, such as `btw`. */
  commands: Schema.Array(SkillSchema),
  skills: Schema.Array(SkillSchema),
  /** The skills are still being read. */
  loading: Schema.Boolean,
  /** Why the skills could not be read. */
  problem: Schema.NullOr(Schema.String),
});
type Listing = typeof Listing.Type;

const Skills = Picker.make('SkillPicker', {
  props: Listing,
  steps: {
    skill: {
      placeholder: () => 'Search skills and commands',
      empty: () => 'No skill or command by that name',
      rows: ({ props }) => ({
        rows: [
          ...props.commands.map(rowOf('Commands')),
          ...props.skills.map(rowOf('Skills')),
        ],
        loading: props.loading,
        problem:
          props.problem === null
            ? null
            : `Couldn't load skills: ${props.problem}`,
      }),
    },
  },
});

const rowOf =
  (group: string) =>
  ({ name, description, argumentHint }: typeof SkillSchema.Type) => ({
    value: name,
    label: `/${name}`,
    group,
    ...(description ? { detail: description } : {}),
    ...(argumentHint ? { hint: argumentHint } : {}),
  });

/**
 * The skills Picker the page keeps while it is open: one Step of skills
 * and commands. `done` hears the name picked, or null.
 */
export const SkillPicker = {
  Live: Skills.Live,
  View: Skills.View,
  opening: (how: typeof Picker.How.Type) => ({
    how,
    step: { id: 'skill', key: '' },
    choices: [],
  }),
  owner: (done: (name: string | null) => Effect.Effect<void>) =>
    Skills.owner({ done: (choices) => done(choices?.at(-1)?.value ?? null) }),
  /** Whether it has anything to offer, or to say: rows, loading, or why not. */
  offers: (listing: Listing) =>
    listing.loading ||
    listing.problem !== null ||
    listing.commands.length + listing.skills.length > 0,
  /** The names a `/name` is drawn as a chip for. */
  known: (listing: Listing) =>
    [...listing.commands, ...listing.skills].map(({ name }) => name),
};

/** `text` with the skill `name` where the Picker was opened: `at`, on the `/` typed there or not. */
export const withSkill = (
  text: string,
  name: string,
  where: { readonly at: number; readonly typed: boolean },
) => withSlash(text, name, where.at, where.typed);

export function Composer({
  label,
  placeholder,
  text,
  onTextChange,
  attachments,
  onAttachmentsChange,
  onSubmit,
  known,
  skills,
  disabled = false,
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
  /** The skills and commands a `/name` in the text is drawn as a chip for. */
  readonly known: ReadonlyArray<string>;
  /** The skills Picker the page keeps. */
  readonly skills: {
    /** How it is open, or null while it is not. */
    readonly how: typeof Picker.How.Type | null;
    /** Whether it has anything to offer, or to say: loading, or why not. */
    readonly offered: boolean;
    /** Open it, to put a skill in at `at`, on a `/` typed there or not. */
    readonly onOpen: (
      how: typeof Picker.How.Type,
      at: number,
      typed: boolean,
    ) => void;
    /** Its View, while it is open. */
    readonly picker: ReactNode;
  };
  readonly disabled?: boolean;
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
  const names = known.join('\n');
  const atoms = useMemo(() => slashAtoms(new Set(names.split('\n'))), [names]);
  const open = Picker.useOpen();
  const spot = keys.useFocusSpot('content', 'composer', { default: true });
  const typingKeys = useTypingKeys();

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
    spot,
    atoms,
    typingKeys,
    onSlash: (at) => {
      if (!skills.offered) return;
      open(() => skills.onOpen('keys', at, true));
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
          <Picker.Frame
            how={skills.how}
            label="Skills and commands"
            onOpen={() =>
              skills.onOpen(
                'pointer',
                editor.view.current?.state.selection.main.head ?? text.length,
                false,
              )
            }
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="xs"
                title="Add a skill or command (/)"
                disabled={disabled || !skills.offered}
                className="text-muted-foreground"
              >
                <SquareSlashIcon aria-hidden />
                Skills
              </Button>
            }
            side="top"
            className="w-[min(26rem,calc(100vw-2rem))]"
          >
            {skills.picker}
          </Picker.Frame>
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
          onClick={(event) => {
            if (event.target === event.currentTarget)
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
    </form>
  );
}
