import { cn } from '@kstackz/ui-toolkit/utils';
import {
  type FocusEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { keys } from './keys.ts';

type Note = {
  readonly id: number;
  readonly title: string;
  readonly body: string;
};

const FIRST: ReadonlyArray<Note> = [
  {
    id: 1,
    title: 'Welcome',
    body: 'Move with j and k, or the arrows. Hold one down to repeat.',
  },
  {
    id: 2,
    title: 'Sequences',
    body: 'Press g, wait, and the bar below lists every way to finish: g for the top, s for settings.',
  },
  {
    id: 3,
    title: 'Editing',
    body: 'Enter edits a note. Escape leaves the text, then the editor. ⌘/Ctrl Enter does both at once.',
  },
  {
    id: 4,
    title: 'Your own keys',
    body: 'g s opens the settings: record new keys for any action. They work at once, and stay after a reload.',
  },
  {
    id: 5,
    title: 'Everything at once',
    body: '? lists every key and where it stands right now. ⌘/Ctrl K runs any of them by name.',
  },
];

/**
 * The notes Surface and the editor inside it: the list's keys move and
 * open notes, the editor's take you back.
 */
export function Notes() {
  const { surface, setSurface } = keys.useSurface();
  const [notes, setNotes] = useState(FIRST);
  const [index, setIndex] = useState(0);
  const editing = surface === 'notes.editor';
  const note = notes[index];
  const last = notes.length - 1;

  keys.useAction('notes.down', () => setIndex((i) => Math.min(i + 1, last)));
  keys.useAction('notes.up', () => setIndex((i) => Math.max(i - 1, 0)));
  keys.useAction('notes.top', () => setIndex(0));
  keys.useAction('notes.bottom', () => setIndex(last));
  keys.useAction('notes.open', () => setSurface('notes.editor'), {
    enabled: note !== undefined,
  });
  keys.useAction('notes.create', () => {
    setNotes((all) => [
      ...all,
      { id: Date.now(), title: 'Untitled', body: '' },
    ]);
    setIndex(notes.length);
    setSurface('notes.editor');
  });
  keys.useAction(
    'notes.remove',
    () => {
      setNotes((all) => all.filter((_, i) => i !== index));
      setIndex((i) => Math.max(0, Math.min(i, notes.length - 2)));
    },
    { enabled: note !== undefined },
  );
  keys.useAction('notes.editor.back', () => setSurface('notes'));
  keys.useAction('notes.editor.done', () => setSurface('notes'));

  const edit = (change: Partial<Note>) =>
    setNotes((all) =>
      all.map((n, i) => (i === index ? { ...n, ...change } : n)),
    );

  const listing = surface === 'notes';
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[16rem_1fr] gap-3 p-3">
      <Pane label="notes" active={listing} dimmed={editing}>
        <ul className="overflow-y-auto p-2">
          {notes.map((each, i) => (
            <li key={each.id}>
              <button
                type="button"
                onClick={() => {
                  setIndex(i);
                  setSurface('notes');
                }}
                onDoubleClick={() => setSurface('notes.editor')}
                className={cn(
                  'w-full truncate rounded-md px-3 py-2 text-left text-sm',
                  i === index
                    ? listing
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'bg-accent font-medium'
                    : 'hover:bg-accent/50',
                )}
              >
                {each.title || 'Untitled'}
              </button>
            </li>
          ))}
        </ul>
      </Pane>
      <Pane label="notes.editor" active={editing} dimmed={listing}>
        {note ? (
          <Editor
            key={note.id}
            note={note}
            editing={editing}
            onChange={edit}
            onFocus={() => setSurface('notes.editor')}
            onBlur={() => setSurface('notes')}
          />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            No notes. Press n.
          </p>
        )}
      </Pane>
    </div>
  );
}

/**
 * One area of the screen and its Surface: ringed while that Surface is
 * Active, dimmed while its neighbour is.
 */
function Pane(props: {
  readonly label: string;
  readonly active: boolean;
  readonly dimmed: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'relative flex min-h-0 flex-col rounded-xl ring-1 ring-edge transition duration-150',
        props.active && 'ring-2 ring-primary',
        props.dimmed && 'opacity-45',
      )}
    >
      {props.active && (
        <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 text-[11px] font-medium text-primary-foreground">
          {props.label}
        </span>
      )}
      {props.children}
    </section>
  );
}

function Editor(props: {
  readonly note: Note;
  readonly editing: boolean;
  readonly onChange: (change: Partial<Note>) => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
}) {
  const body = useRef<HTMLTextAreaElement>(null);
  // Opening the editor puts the cursor in the text; leaving it lets go,
  // but only of its own fields, never of a dialog that took focus.
  useEffect(() => {
    if (props.editing) body.current?.focus();
    else if (body.current?.parentElement?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [props.editing]);
  // Focus follows the Surface and the Surface follows focus: leaving the
  // text while editing, such as with Escape, goes back to the list. Leaving
  // it because another Surface opened is not editing any more, so it stays.
  const blur = (event: FocusEvent) => {
    const into = event.relatedTarget;
    if (!props.editing) return;
    if (
      into instanceof Node &&
      event.currentTarget.parentElement?.contains(into)
    )
      return;
    props.onBlur();
  };
  return (
    <div className="flex flex-1 flex-col gap-2 p-6">
      <input
        value={props.note.title}
        onChange={(event) => props.onChange({ title: event.target.value })}
        onFocus={props.onFocus}
        onBlur={blur}
        className="bg-transparent text-xl font-semibold outline-none"
      />
      <textarea
        ref={body}
        value={props.note.body}
        onChange={(event) => props.onChange({ body: event.target.value })}
        onFocus={props.onFocus}
        onBlur={blur}
        className="min-h-40 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none"
      />
    </div>
  );
}
