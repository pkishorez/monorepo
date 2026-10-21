import {
  acceptCompletion,
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { Prec, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { slashQuery } from './query.ts';
import { rank } from './rank.ts';
import { descriptionNode, look } from './look.ts';

/*
 * The `/` menu. Typing `/` at the start of a word opens it above the
 * cursor; the list narrows as the name is typed, best match first, each
 * with what it does and the arguments it takes. Choosing one puts
 * `/name ` where the typed `/query` was.
 */

interface Entry {
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string | undefined;
}

const descriptions = new WeakMap<Completion, string>();

/** `entries` is read each time the menu opens or narrows. */
export function slashMenu(entries: () => ReadonlyArray<Entry>): Extension {
  return [
    autocompletion({
      override: [(context) => complete(context, entries())],
      aboveCursor: true,
      icons: false,
      addToOptions: [
        {
          render: (option) => {
            const text = descriptions.get(option);
            return text ? descriptionNode(text) : null;
          },
          position: 90,
        },
      ],
      tooltipClass: () => 'cm-slash-menu',
    }),
    Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
    look,
  ];
}

/*
 * Opens the menu at the cursor, as if `/` were typed there; the editor
 * keeps its cursor while a toolbar button has focus.
 */
export function openSlashMenu(view: EditorView): void {
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  if (slashQuery(line.text.slice(0, head - line.from)) === null) {
    const before = head > line.from ? line.text[head - line.from - 1]! : '';
    const insert = before === '' || /\s/.test(before) ? '/' : ' /';
    view.dispatch({
      changes: { from: head, insert },
      selection: { anchor: head + insert.length },
      userEvent: 'input.type',
    });
  }
  view.focus();
  startCompletion(view);
}

function complete(
  context: CompletionContext,
  entries: ReadonlyArray<Entry>,
): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const typed = slashQuery(line.text.slice(0, context.pos - line.from));
  if (typed === null) return null;
  const found = rank(entries, typed.query);
  if (found.length === 0) return null;
  const matched = new Map<Completion, ReadonlyArray<number>>();
  const options = found.map(({ entry, matched: letters }) => {
    const option: Completion = {
      label: `/${entry.name}`,
      detail: entry.argumentHint,
      apply: (view, _completion, from, to) => {
        const spaced = view.state.sliceDoc(to, to + 1) === ' ';
        const insert = spaced ? `/${entry.name}` : `/${entry.name} `;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length + (spaced ? 1 : 0) },
          userEvent: 'input.complete',
        });
      },
    };
    matched.set(option, letters);
    descriptions.set(option, entry.description);
    return option;
  });
  return {
    from: line.from + typed.from,
    options,
    filter: false,
    getMatch: (option) =>
      (matched.get(option) ?? []).flatMap((at) => [at + 1, at + 2]),
  };
}
