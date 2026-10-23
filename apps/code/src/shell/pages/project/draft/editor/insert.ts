import { isolateHistory } from '@codemirror/commands';
import {
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

/*
 * Putting something into the Draft: the one way text goes in that was not
 * typed, such as a paste, a dropped text, a Skill or a Dictation. It replaces the
 * selection, leaves the cursor after it, scrolls it into view, and is its
 * own step in the history, so one undo takes it out again. What went in
 * is marked `cm-inserted`, whose fade the stylesheet draws; the mark goes
 * when the fade ends, or with the next insert.
 */

/** The change an insert makes, from the state it goes into. */
export type Change = (state: EditorState) => {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
};

const marked = StateEffect.define<{ from: number; to: number } | null>();

// Open from its very start, and drawn outside the chips, so a Skill's chip
// is inside it.
const inserted = Decoration.mark({
  class: 'cm-inserted',
  inclusiveStart: true,
});

const mark = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (marks, transaction) => {
    let next = marks.map(transaction.changes);
    for (const effect of transaction.effects)
      if (effect.is(marked))
        next =
          effect.value === null || effect.value.from === effect.value.to
            ? Decoration.none
            : Decoration.set([
                inserted.range(effect.value.from, effect.value.to),
              ]);
    return next;
  },
  provide: (field) => Prec.lowest(EditorView.decorations.from(field)),
});

/** The mark of what went in last, and its end with the fade. */
export const insertMark: Extension = [
  mark,
  EditorView.domEventHandlers({
    animationend: (event, view) => {
      if (
        event.target instanceof Element &&
        event.target.classList.contains('cm-inserted')
      )
        view.dispatch({ effects: marked.of(null) });
      return false;
    },
  }),
];

/** Puts `change` into the editor at its selection, as an insert, with any `effects` of its own. */
export function insert(
  view: EditorView,
  change: Change,
  effects: ReadonlyArray<StateEffect<unknown>> = [],
) {
  const { from, to, insert: text } = change(view.state);
  const end = from + text.length;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: end },
    effects: [
      ...effects,
      marked.of({ from, to: end }),
      EditorView.scrollIntoView(end, { y: 'nearest' }),
    ],
    annotations: isolateHistory.of('full'),
    userEvent: 'input.paste',
  });
}

/** `text` over the selection. */
export const textChange =
  (text: string): Change =>
  ({ selection }) => ({
    from: selection.main.from,
    to: selection.main.to,
    insert: text,
  });
