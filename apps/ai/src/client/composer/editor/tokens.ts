import type { Extension } from '@codemirror/state';
import {
  Decoration,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';

/*
 * A `/name` at the start of a word, for a name the composer knows, reads as
 * a quiet inline chip. The text stays plain text: the chip is only a look.
 */

const chip = Decoration.mark({ class: 'cm-slash-token' });

export function slashTokens(known: ReadonlySet<string>): Extension {
  const matcher = new MatchDecorator({
    regexp: /(^|\s)\/([\w:.-]+)(?=\s|$)/g,
    decorate: (add, from, to, match) => {
      if (known.has(match[2]!)) add(from + match[1]!.length, to, chip);
    },
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
