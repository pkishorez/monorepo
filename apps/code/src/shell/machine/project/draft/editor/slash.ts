import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/*
 * A `/` typed at the start of a word is written, then handed on, so the
 * Composer can open its skills Picker; `a/b` and `http://` stay plain
 * text. A name picked there takes that `/`'s place as `/name `, which the
 * atoms draw as a chip; picked with no `/` to replace, it goes in at the
 * cursor, over the selection.
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
 * The change that puts the skill `name` in over the selection `from` to
 * `to` of `text`, as `/name `: on the `/` typed just before it when
 * `typed`, else apart from the word before it.
 */
export function skillChange(
  text: string,
  name: string,
  { from, to, typed }: { from: number; to: number; typed: boolean },
) {
  const there = typed && from > 0 && text.charAt(from - 1) === '/';
  const start = there ? from - 1 : from;
  const startsWord = start === 0 || /\s/.test(text.charAt(start - 1));
  const spaced = /\s/.test(text.charAt(to));
  return {
    from: start,
    to,
    insert: `${startsWord ? '' : ' '}/${name}${spaced ? '' : ' '}`,
  };
}
