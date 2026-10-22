import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  type Extension,
} from '@codemirror/state';
import { describe, shortcutOf } from '@kestack/use-keys';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { useEffect, useRef, type RefObject } from 'react';
import { sendKeys } from './keys.ts';
import { theme } from './theme.ts';
import { slashTrigger } from './slash.ts';

/*
 * A plain-text CodeMirror editor that a React parent controls: its text
 * is the `text` it is given, and every edit reports back. A new `text`
 * changes only the span that differs, and the cursor keeps its place
 * around it, so a chip put in where a `/` was typed leaves the cursor after
 * it. It grows with its content up to a limit, then scrolls. It is created
 * after mount, so the server renders an empty box of one line's height;
 * its field is then given to `spot`, the Focus Spot focus comes back to.
 */

interface EditorOptions {
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  readonly onSend: () => void;
  readonly onPasteFiles: (files: ReadonlyArray<File>) => void;
  readonly label: string;
  readonly describedBy: string | undefined;
  readonly placeholder: string;
  readonly disabled: boolean;
  /** Marks the editor's field as a Focus Spot; what it gives back unmarks it. */
  readonly spot: (element: HTMLElement) => (() => void) | undefined;
  /** A `/` was typed at the start of a word, at this position. */
  readonly onSlash: (at: number) => void;
  /** Text drawn as chips; swapped whenever it changes. */
  readonly atoms: Extension;
  /**
   * Hands the page the keys it takes even while typing, as people write
   * them, such as Ctrl+K for Session Actions, before the editor's own
   * macOS Ctrl keys; says whether the page took it.
   */
  readonly typingKeys: (pressed: string) => boolean;
}

const fromProps = Annotation.define<boolean>();

export function useEditor(options: EditorOptions): {
  readonly parent: RefObject<HTMLDivElement | null>;
  readonly view: RefObject<EditorView | null>;
} {
  const parent = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const parts = useRef({
    attributes: new Compartment(),
    editable: new Compartment(),
    placeholder: new Compartment(),
    atoms: new Compartment(),
  }).current;

  useEffect(() => {
    const options = latest.current;
    const created = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: options.text,
        selection: { anchor: options.text.length },
        extensions: [
          history(),
          // Before any keymap: a key the page takes is not the editor's.
          Prec.highest(
            EditorView.domEventHandlers({
              keydown: (event, view) => {
                if (view.composing) return false;
                const pressed = shortcutOf(event);
                return (
                  pressed !== null &&
                  latest.current.typingKeys(describe(pressed))
                );
              },
            }),
          ),
          sendKeys(() => latest.current.onSend()),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          theme,
          slashTrigger((at) => latest.current.onSlash(at)),
          parts.attributes.of(attributes(options)),
          parts.editable.of(editable(options.disabled)),
          parts.placeholder.of(placeholder(options.placeholder)),
          parts.atoms.of(options.atoms),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((each) => each.annotation(fromProps))
            )
              latest.current.onTextChange(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste: (event) => {
              const files = [...(event.clipboardData?.files ?? [])];
              if (files.length === 0) return false;
              event.preventDefault();
              latest.current.onPasteFiles(files);
              return true;
            },
          }),
        ],
      }),
    });
    view.current = created;
    const unmark = options.spot(created.contentDOM);
    return () => {
      unmark?.();
      created.destroy();
      view.current = null;
    };
  }, [parts]);

  useEffect(() => {
    const current = view.current;
    if (current === null) return;
    const changes = difference(current.state.doc.toString(), options.text);
    if (changes === null) return;
    const set = current.state.changes(changes);
    current.dispatch({
      changes: set,
      selection: current.state.selection.map(set, 1),
      annotations: fromProps.of(true),
    });
  }, [options.text]);

  const { label, describedBy, disabled } = options;
  useEffect(() => {
    view.current?.dispatch({
      effects: [
        parts.attributes.reconfigure(attributes({ label, describedBy })),
        parts.editable.reconfigure(editable(disabled)),
      ],
    });
  }, [parts, label, describedBy, disabled]);

  useEffect(() => {
    view.current?.dispatch({
      effects: parts.placeholder.reconfigure(placeholder(options.placeholder)),
    });
  }, [parts, options.placeholder]);

  useEffect(() => {
    view.current?.dispatch({
      effects: parts.atoms.reconfigure(options.atoms),
    });
  }, [parts, options.atoms]);

  return { parent, view };
}

/** The one span where `next` differs from `now`, or null when they are the same. */
function difference(now: string, next: string) {
  if (now === next) return null;
  let start = 0;
  while (
    start < now.length &&
    start < next.length &&
    now[start] === next[start]
  )
    start++;
  let end = 0;
  while (
    end < now.length - start &&
    end < next.length - start &&
    now[now.length - 1 - end] === next[next.length - 1 - end]
  )
    end++;
  return {
    from: start,
    to: now.length - end,
    insert: next.slice(start, next.length - end),
  };
}

function attributes({
  label,
  describedBy,
}: Pick<EditorOptions, 'label' | 'describedBy'>): Extension {
  return EditorView.contentAttributes.of({
    'aria-label': label,
    'aria-multiline': 'true',
    ...(describedBy === undefined ? {} : { 'aria-describedby': describedBy }),
  });
}

function editable(disabled: boolean): Extension {
  return [EditorView.editable.of(!disabled), EditorState.readOnly.of(disabled)];
}
