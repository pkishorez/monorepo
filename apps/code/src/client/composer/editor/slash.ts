import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/*
 * A `/` typed at the start of a word is written, then handed on, so the
 * composer can open its palette; `a/b` and `http://` stay plain text. A
 * name picked there takes that `/`'s place as `/name `, which the atoms
 * draw as a chip; picked with no `/` to replace, it goes in at the cursor.
 */

const startsWord = (view: EditorView, at: number) =>
  at === 0 || /\s/.test(view.state.sliceDoc(at - 1, at));

export function slashTrigger(open: (at: number) => void): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== '/' || view.composing || !startsWord(view, from)) return false;
    view.dispatch({
      changes: { from, to, insert: '/' },
      selection: { anchor: from + 1 },
      userEvent: 'input.type',
    });
    open(from);
    return true;
  });
}

/** `at` is where the typed `/` is, or null to insert at the cursor. */
export function insertSlash(
  view: EditorView,
  name: string,
  at: number | null,
): void {
  const typed = at !== null && view.state.sliceDoc(at, at + 1) === '/';
  const head = view.state.selection.main.head;
  const from = typed ? at : head;
  const to = typed ? at + 1 : head;
  const spaced = /\s/.test(view.state.sliceDoc(to, to + 1));
  const insert = `${startsWord(view, from) ? '' : ' '}/${name}${spaced ? '' : ' '}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length + (spaced ? 1 : 0) },
    userEvent: 'input.complete',
  });
  view.focus();
}
