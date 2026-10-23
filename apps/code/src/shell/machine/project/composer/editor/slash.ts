import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/*
 * A `/` typed at the start of a word is written, then handed on, so the
 * composer can open its skills Picker; `a/b` and `http://` stay plain
 * text. A name picked there takes that `/`'s place as `/name `, which the
 * atoms draw as a chip; picked with no `/` to replace, it goes in at the
 * cursor. The text changes where it is kept, and the editor follows.
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

/**
 * `text` with `/name ` in place of the `/` typed at `at`, or put in at
 * `at` when `typed` is false, apart from the word before it.
 */
export function withSlash(
  text: string,
  name: string,
  at: number,
  typed: boolean,
): string {
  const there = typed && text.charAt(at) === '/';
  const from = Math.min(at, text.length);
  const to = there ? from + 1 : from;
  const startsWord = from === 0 || /\s/.test(text.charAt(from - 1));
  const spaced = /\s/.test(text.charAt(to));
  return `${text.slice(0, from)}${startsWord ? '' : ' '}/${name}${spaced ? '' : ' '}${text.slice(to)}`;
}
