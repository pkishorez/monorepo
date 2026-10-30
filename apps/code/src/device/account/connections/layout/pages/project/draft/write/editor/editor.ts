import {
  defaultKeymap,
  history,
  historyField,
  historyKeymap,
  undo,
} from '@codemirror/commands';
import {
  Annotation,
  Compartment,
  type EditorSelection,
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
} from './dictation/dictation.ts';
import {
  insert,
  insertMark,
  textChange,
  type Change,
} from './insert/insert.ts';
import {
  skillAtom,
  skillAtoms,
  skillChange,
  slashTrigger,
} from './skills/skills.ts';

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
 * cursor are drawn whether it has focus or not. Inserts (`insert/`) and
 * undo work either way, unless `disabled`: a paste or a drop, a Skill
 * picked, which goes in as one atom (`skills/`), and a Dictation's text,
 * whose placeholder waits where the cursor was for it (`dictation/`).
 *
 * It holds one text at a time, `doc` names which: given another, it keeps
 * the one it held, its selection and history with it, and shows the other
 * as it was left, or from `text` and `selection` the first time, in the
 * same field, so focus stays. A Dictation's placeholder goes with it to
 * the text shown. The texts not shown are kept in `held`, which may
 * outlast the editor: one drawn anew with the same `held` and `doc` takes
 * its text up as it was left, its undo history with it.
 */

/** The texts an editor does not show, as they were left, by `doc`. */
export type Held = Map<string, EditorState>;

/** A cursor, or a selection from `anchor` to `head`. */
export interface Selected {
  readonly anchor: number;
  readonly head: number;
}

interface EditorOptions {
  readonly text: string;
  /** Which text it holds; null when it only ever holds one. */
  readonly doc?: string | null;
  /** Where the texts not shown are kept; its own, unless given one that outlasts it. */
  readonly held?: Held;
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
  /**
   * Hands the page the keys it takes even while typing, as people write
   * them, such as Ctrl+K for Actions, before the editor's own
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
  /**
   * Makes it writable at once and gives it focus: the Composer. With
   * `scroll` off, its words stay scrolled where they were, the cursor
   * brought into view only once typed at.
   */
  readonly write: (how?: { readonly scroll?: boolean }) => void;
} {
  const parent = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const parts = useRef({
    attributes: new Compartment(),
    editable: new Compartment(),
  }).current;

  const mount = useCallback((element: HTMLDivElement | null) => {
    parent.current = element;
    const current = view.current;
    if (element === null || current === null) return;
    if (current.dom.parentElement === element) return;
    element.appendChild(current.dom);
    current.requestMeasure();
  }, []);

  // A fresh state for a text, as the options are now; or the one left, its
  // text, selection and history taken over.
  const stateOf = useCallback(
    (
      text: string,
      selection: Selected | null | undefined,
      left?: EditorState,
    ) => {
      const options = latest.current;
      const extensions = [
        history(),
        drawSelection(),
        holding,
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
                pressed !== null && latest.current.typingKeys(describe(pressed))
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
        skillAtoms,
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
      ];
      return left === undefined
        ? EditorState.create({
            doc: text,
            selection: within(selection, text.length),
            extensions,
          })
        : EditorState.fromJSON(
            left.toJSON({ history: historyField, skills: skillAtoms }),
            { extensions },
            { history: historyField, skills: skillAtoms },
          );
    },
    [parts],
  );

  const own = useRef<Held>(new Map());
  const held = options.held ?? own.current;
  const shown = useRef(options.doc ?? null);

  /** The state shown, kept as it is left, without a Dictation's placeholder. */
  const keep = (current: EditorView) => {
    if (shown.current === null) return null;
    const awaited = awaitedIn(current.state);
    held.set(
      shown.current,
      awaited === null
        ? current.state
        : current.state.update({ effects: awaiting.of(null) }).state,
    );
    return awaited;
  };

  /** The state of `doc` as it was left, or a fresh one; and what changed since. */
  const takeUp = (doc: string | null) => {
    const options = latest.current;
    const left = doc === null ? undefined : held.get(doc);
    const next = stateOf(options.text, options.selection, left);
    return { next, changes: difference(next.doc.toString(), options.text) };
  };

  useEffect(() => {
    const { next, changes } = takeUp(shown.current);
    const created = new EditorView({
      parent: parent.current!,
      state:
        changes === null
          ? next
          : next.update({
              changes,
              selection: next.selection.map(next.changes(changes), 1),
              annotations: Transaction.addToHistory.of(false),
            }).state,
    });
    view.current = created;
    const unmark = latest.current.spot(created.contentDOM);
    return () => {
      unmark?.();
      keep(created);
      created.destroy();
      view.current = null;
    };
  }, [stateOf]);

  // Another text: the one shown is kept, the other shown as it was left.
  const doc = options.doc ?? null;
  useEffect(() => {
    const current = view.current;
    if (current === null || shown.current === doc) return;
    const awaited = keep(current);
    shown.current = doc;
    const options = latest.current;
    const { next, changes } = takeUp(doc);
    current.setState(next);
    // Set while it was not shown, as a text cleared once sent.
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

  return {
    parent,
    mount,
    view,
    insert: (put) => {
      if (view.current === null || latest.current.disabled) return false;
      insert(view.current, changeOf(put), (made) =>
        put._tag === 'Dictated'
          ? [awaiting.of(null)]
          : put._tag === 'Skill'
            ? [skillAtom(made, put.name)]
            : [],
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
    write: (how) => {
      const current = view.current;
      if (current === null || latest.current.disabled) return;
      // Where the cursor was, kept through the focus: iOS may put it at
      // the start as its keyboard rises, a moment after.
      const kept = current.state.selection;
      current.dispatch({
        effects: parts.editable.reconfigure(
          editable({ disabled: false, writing: true }),
        ),
      });
      current.focus();
      current.dispatch({
        selection: kept,
        scrollIntoView: how?.scroll ?? true,
      });
      holdSelection(current, kept);
    },
  };
}

/** How long after focus a move of the cursor the browser made is undone, in ms. */
const HOLD = 600;

/** The cursor each editor keeps for a moment after focus, as the text moves. */
const held = new WeakMap<EditorView, EditorSelection>();

/**
 * Undoes, while a cursor is held, a move read from the page's own
 * selection: iOS puts it at the start as its keyboard rises. A tap
 * (`select.pointer`) or a key lets go; a move the app makes is its own.
 */
const holding = EditorView.updateListener.of((update) => {
  const kept = held.get(update.view);
  if (kept === undefined) return;
  const mapped = update.docChanged ? kept.map(update.changes) : kept;
  held.set(update.view, mapped);
  const browsers = update.transactions.some(
    (tr) =>
      tr.selection !== undefined &&
      tr.isUserEvent('select') &&
      !tr.isUserEvent('select.pointer'),
  );
  if (browsers && !update.state.selection.eq(mapped))
    queueMicrotask(() => update.view.dispatch({ selection: mapped }));
});

/** Keeps `kept` for a moment after focus; a touch or a key lets go. */
function holdSelection(current: EditorView, kept: EditorSelection) {
  const dom = current.contentDOM;
  held.set(current, kept);
  const release = () => {
    held.delete(current);
    dom.removeEventListener('pointerdown', release);
    dom.removeEventListener('keydown', release);
  };
  dom.addEventListener('pointerdown', release);
  dom.addEventListener('keydown', release);
  setTimeout(release, HOLD);
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

/*
 * Cmd/Ctrl+Enter sends; Enter is a new line, as it is in any text box, so
 * a message is never sent half written. On a touch screen, whose keyboard
 * has no Cmd, only Send sends. Never while an input method is composing.
 */

function sendKeys(send: () => void): Extension {
  const run = (view: EditorView) => {
    if (view.composing) return false;
    send();
    return true;
  };
  return Prec.high(keymap.of([{ key: 'Mod-Enter', run }]));
}

/*
 * The editor in the app's own colours, set as a sent message's words are.
 * Every colour is a theme variable, so light and dark follow the page with
 * nothing to switch. The text is 16px so iOS does not zoom in on focus.
 * The cursor shows without focus too, still, so the Draft says where the
 * next insert goes; it blinks only in the Composer. A Dictation's
 * placeholder is quiet, italic, and its retry reads as a link.
 */

const theme = EditorView.theme({
  // Its card says how bright its words are: muted while read only.
  '&': {
    color: 'inherit',
    backgroundColor: 'transparent',
    fontSize: '1rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.75' },
  '.cm-content': {
    padding: '0',
    caretColor: 'var(--foreground)',
    minHeight: '1.75rem',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursorLayer .cm-cursor': {
    display: 'block',
    borderLeftColor: 'var(--foreground)',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: 'color-mix(in oklch, var(--ring) 35%, transparent)' },
  '.cm-atom': {
    backgroundColor: 'var(--muted)',
    borderRadius: '0.3125rem',
    boxShadow: '0 0 0 1px color-mix(in oklch, var(--border) 80%, transparent)',
    padding: '0 0.25rem',
    fontWeight: '500',
    fontSize: '0.9375em',
  },
  '.cm-dictation': {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
    fontSize: '0.9375em',
    padding: '0 0.125rem',
  },
  '.cm-dictation[data-failed] button': {
    color: 'var(--destructive)',
    fontStyle: 'normal',
    textDecoration: 'underline',
    textUnderlineOffset: '4px',
    cursor: 'pointer',
  },
});
