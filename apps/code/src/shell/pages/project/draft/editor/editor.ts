import {
  defaultKeymap,
  history,
  historyKeymap,
  undo,
} from '@codemirror/commands';
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  Transaction,
  type Extension,
} from '@codemirror/state';
import { describe, shortcutOf } from '@kestack/use-keys';
import { drawSelection, EditorView, keymap } from '@codemirror/view';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  awaitedIn,
  awaiting,
  dictatedChange,
  dictation,
  retrying,
  type Awaited,
} from './dictation.ts';
import { insert, insertMark, textChange, type Change } from './insert.ts';
import { sendKeys } from './keys.ts';
import { theme } from './theme.ts';
import { skillChange, slashTrigger } from './slash.ts';

/*
 * A plain-text CodeMirror editor that a React parent controls: its text
 * is the `text` it is given, and every edit reports back. A new `text`
 * changes only the span that differs, the cursor keeps its place around
 * it, and it is no step of the history: it is the page's, such as the
 * text clearing once sent. It grows with its content. It is created after
 * mount, so the server renders an empty box of one line's height; its
 * field is then given to `spot`, the Focus Spot focus comes back to. The
 * element it is drawn in is `mount`'s: given another, as when the card
 * around it is drawn anew, the same editor moves into it, its text,
 * selection and history with it.
 *
 * It can be typed into only while `writing`; otherwise it can still be
 * clicked to place the cursor, or dragged to select, and its selection and
 * cursor are drawn whether it has focus or not. Inserts and undo work
 * either way, unless `disabled`, and so does a Dictation's placeholder,
 * which waits where the cursor was for its text (`dictation.ts`).
 *
 * It holds one text at a time, `doc` names which: given another, it keeps
 * the one it held, its selection and history with it, and shows the other
 * as it was left, or from `text` and `selection` the first time, in the
 * same field, so focus stays. A Dictation's placeholder goes with it to
 * the text shown.
 */

/** A cursor, or a selection from `anchor` to `head`. */
export interface Selected {
  readonly anchor: number;
  readonly head: number;
}

interface EditorOptions {
  readonly text: string;
  /** Which text it holds; null when it only ever holds one. */
  readonly doc?: string | null;
  /** Where the cursor starts in a text first shown; else at its end. */
  readonly selection?: Selected | null;
  readonly onTextChange: (text: string, selection: Selected) => void;
  /** The cursor or selection moved, the text as it is. */
  readonly onSelect?: (text: string, selection: Selected) => void;
  /** Escape pressed in it; says whether it was taken. */
  readonly onEscape?: () => boolean;
  readonly onSend: () => void;
  readonly label: string;
  readonly describedBy: string | undefined;
  /** What an empty Draft says, as a screen reader hears it; the card draws it. */
  readonly placeholder: string;
  readonly disabled: boolean;
  /** Whether it is the Composer, typed into, rather than read only. */
  readonly writing: boolean;
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
  /** A failed Dictation's placeholder was clicked to try it again. */
  readonly onRetry: (id: number) => void;
}

/**
 * What goes into the Draft: text, a Skill, on the `/` typed or not, or a
 * Dictation's text, in place of its placeholder.
 */
type Put =
  | { readonly _tag: 'Text'; readonly text: string }
  | { readonly _tag: 'Skill'; readonly name: string; readonly typed: boolean }
  | { readonly _tag: 'Dictated'; readonly id: number; readonly text: string };

const changeOf = (put: Put): Change =>
  put._tag === 'Text'
    ? textChange(put.text)
    : put._tag === 'Dictated'
      ? dictatedChange(put.id, put.text)
      : ({ doc, selection }) =>
          skillChange(doc.toString(), put.name, {
            from: selection.main.from,
            to: selection.main.to,
            typed: put.typed,
          });

const fromProps = Annotation.define<boolean>();

const selectedIn = (state: EditorState): Selected => ({
  anchor: state.selection.main.anchor,
  head: state.selection.main.head,
});

/** `selection` inside a text of `length`, else its end. */
const within = (selection: Selected | null | undefined, length: number) => ({
  anchor: Math.min(selection?.anchor ?? length, length),
  head: Math.min(selection?.head ?? length, length),
});

export function useEditor(options: EditorOptions): {
  /** The element it is drawn in, while there is one. */
  readonly parent: RefObject<HTMLDivElement | null>;
  /** The ref for that element: the editor moves into each one given. */
  readonly mount: (element: HTMLDivElement | null) => void;
  readonly view: RefObject<EditorView | null>;
  /** Puts text or a Skill in at the selection, as an insert; says whether it went in. */
  readonly insert: (put: Put) => boolean;
  /** Shows the placeholder of the Dictation it waits for; null, none. */
  readonly awaiting: (awaited: Awaited | null) => void;
  /** Takes the last step of the history back. */
  readonly undo: () => void;
  /** Makes it writable at once and gives it focus: the Composer. */
  readonly write: () => void;
} {
  const parent = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const parts = useRef({
    attributes: new Compartment(),
    editable: new Compartment(),
    atoms: new Compartment(),
  }).current;

  const mount = useCallback((element: HTMLDivElement | null) => {
    parent.current = element;
    const current = view.current;
    if (element === null || current === null) return;
    if (current.dom.parentElement === element) return;
    element.appendChild(current.dom);
    current.requestMeasure();
  }, []);

  // A fresh state for a text, as the options are now.
  const stateOf = useCallback(
    (text: string, selection: Selected | null | undefined) => {
      const options = latest.current;
      return EditorState.create({
        doc: text,
        selection: within(selection, text.length),
        extensions: [
          history(),
          drawSelection(),
          insertMark,
          dictation,
          retrying.of((id) => latest.current.onRetry(id)),
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
          keymap.of([
            {
              key: 'Escape',
              run: () => latest.current.onEscape?.() ?? false,
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          theme,
          slashTrigger((at) => latest.current.onSlash(at)),
          parts.attributes.of(attributes(options)),
          parts.editable.of(editable(options)),
          parts.atoms.of(options.atoms),
          EditorView.updateListener.of((update) => {
            if (update.transactions.some((each) => each.annotation(fromProps)))
              return;
            if (update.docChanged)
              latest.current.onTextChange(
                update.state.doc.toString(),
                selectedIn(update.state),
              );
            else if (update.selectionSet)
              latest.current.onSelect?.(
                update.state.doc.toString(),
                selectedIn(update.state),
              );
          }),
        ],
      });
    },
    [parts],
  );

  // The texts not shown, as they were left, by `doc`.
  const held = useRef(new Map<string, EditorState>());
  const shown = useRef(options.doc ?? null);

  useEffect(() => {
    const options = latest.current;
    const created = new EditorView({
      parent: parent.current!,
      state: stateOf(options.text, options.selection),
    });
    view.current = created;
    const unmark = options.spot(created.contentDOM);
    return () => {
      unmark?.();
      created.destroy();
      view.current = null;
    };
  }, [stateOf]);

  // Another text: the one shown is kept, the other shown as it was left.
  const doc = options.doc ?? null;
  useEffect(() => {
    const current = view.current;
    if (current === null || shown.current === doc) return;
    const awaited = awaitedIn(current.state);
    if (shown.current !== null)
      held.current.set(
        shown.current,
        awaited === null
          ? current.state
          : current.state.update({ effects: awaiting.of(null) }).state,
      );
    shown.current = doc;
    const options = latest.current;
    const next =
      (doc === null ? undefined : held.current.get(doc)) ??
      stateOf(options.text, options.selection);
    current.setState(next);
    // Set while it was not shown, as a text cleared once sent.
    const changes = difference(next.doc.toString(), options.text);
    current.dispatch({
      ...(changes === null
        ? {}
        : {
            changes,
            selection: next.selection.map(next.changes(changes), 1),
          }),
      effects: [
        parts.attributes.reconfigure(attributes(options)),
        parts.editable.reconfigure(editable(options)),
        parts.atoms.reconfigure(options.atoms),
        ...(awaited === null ? [] : [awaiting.of(awaited)]),
      ],
      annotations: [fromProps.of(true), Transaction.addToHistory.of(false)],
    });
  }, [doc]);

  useEffect(() => {
    const current = view.current;
    if (current === null) return;
    const changes = difference(current.state.doc.toString(), options.text);
    if (changes === null) return;
    const set = current.state.changes(changes);
    current.dispatch({
      changes: set,
      selection: current.state.selection.map(set, 1),
      annotations: [fromProps.of(true), Transaction.addToHistory.of(false)],
    });
  }, [options.text]);

  const { label, describedBy, placeholder, disabled, writing } = options;
  useEffect(() => {
    view.current?.dispatch({
      effects: [
        parts.attributes.reconfigure(
          attributes({ label, describedBy, placeholder }),
        ),
        parts.editable.reconfigure(editable({ disabled, writing })),
      ],
    });
  }, [parts, label, describedBy, placeholder, disabled, writing]);

  useEffect(() => {
    view.current?.dispatch({
      effects: parts.atoms.reconfigure(options.atoms),
    });
  }, [parts, options.atoms]);

  return {
    parent,
    mount,
    view,
    insert: (put) => {
      if (view.current === null || latest.current.disabled) return false;
      insert(
        view.current,
        changeOf(put),
        put._tag === 'Dictated' ? [awaiting.of(null)] : [],
      );
      return true;
    },
    awaiting: (awaited) => {
      const current = view.current;
      if (current === null) return;
      const now = awaitedIn(current.state);
      if (
        awaited === null
          ? now === null
          : now !== null &&
            now.id === awaited.id &&
            now.failed === awaited.failed &&
            now.reason === awaited.reason
      )
        return;
      current.dispatch({ effects: awaiting.of(awaited) });
    },
    undo: () => {
      if (view.current !== null) undo(view.current);
    },
    write: () => {
      const current = view.current;
      if (current === null || latest.current.disabled) return;
      current.dispatch({
        effects: parts.editable.reconfigure(
          editable({ disabled: false, writing: true }),
        ),
      });
      current.focus();
    },
  };
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

// The placeholder is drawn by the Draft's card, behind the editor, so the
// cursor of an empty Draft sits where it always does; here it is only said.
function attributes({
  label,
  describedBy,
  placeholder,
}: Pick<EditorOptions, 'label' | 'describedBy' | 'placeholder'>): Extension {
  return EditorView.contentAttributes.of({
    'aria-label': label,
    'aria-placeholder': placeholder,
    'aria-multiline': 'true',
    ...(describedBy === undefined ? {} : { 'aria-describedby': describedBy }),
  });
}

function editable({
  disabled,
  writing,
}: Pick<EditorOptions, 'disabled' | 'writing'>): Extension {
  return [
    EditorView.editable.of(writing && !disabled),
    EditorState.readOnly.of(disabled),
  ];
}
