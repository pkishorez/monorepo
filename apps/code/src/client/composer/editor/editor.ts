import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { useEffect, useRef, type RefObject } from 'react';
import { sendKeys } from './keys.ts';
import { theme } from './theme.ts';
import { slashTrigger } from './slash.ts';

/*
 * A plain-text CodeMirror editor that a React parent controls: its text
 * is the `text` it is given, and every edit reports back. It grows with
 * its content up to a limit, then scrolls. It is created after mount, so
 * the server renders an empty box of one line's height.
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
  readonly autoFocus: boolean;
  /** A `/` was typed at the start of a word, at this position. */
  readonly onSlash: (at: number) => void;
  /** Text drawn as chips; swapped whenever it changes. */
  readonly atoms: Extension;
}

const fromProps = Annotation.define<boolean>();

/*
 * Keys the page takes even while typing: Page Up and Page Down scroll the
 * transcript, and Ctrl+[ and Ctrl+] go to the previous and next session,
 * which is Mod-[ and Mod-] off Apple platforms, the editor's indenting.
 */
const pageKeys = new Set(['PageUp', 'PageDown', 'Mod-[', 'Mod-]']);
const ownKeys = defaultKeymap.filter(({ key }) => !pageKeys.has(key ?? ''));

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
          sendKeys(() => latest.current.onSend()),
          keymap.of([...ownKeys, ...historyKeymap]),
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
    if (options.autoFocus) created.focus();
    return () => {
      created.destroy();
      view.current = null;
    };
  }, [parts]);

  useEffect(() => {
    const current = view.current;
    if (current === null || current.state.doc.toString() === options.text)
      return;
    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: options.text },
      selection: { anchor: options.text.length },
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
