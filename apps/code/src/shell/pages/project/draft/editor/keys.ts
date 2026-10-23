import { insertNewlineAndIndent } from '@codemirror/commands';
import { Prec, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';

/*
 * Enter and Cmd/Ctrl+Enter send; Shift+Enter is a new line. Never while an
 * input method is composing: there Enter picks the composed word.
 */

export function sendKeys(send: () => void): Extension {
  const run = (view: EditorView) => {
    if (view.composing) return false;
    send();
    return true;
  };
  return Prec.high(
    keymap.of([
      { key: 'Enter', run, shift: insertNewlineAndIndent },
      { key: 'Mod-Enter', run },
    ]),
  );
}
