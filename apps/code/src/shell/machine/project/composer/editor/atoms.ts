import type { Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

/*
 * Atoms: spans of plain text the editor draws as one unit. The text stays
 * in the document, so what is sent is what was written; on screen a span
 * is a chip the cursor steps over and Backspace removes whole. Each kind
 * says which text it covers and how that text looks.
 */

export interface AtomKind {
  /** Global; each match is a candidate atom. */
  readonly regexp: RegExp;
  /** The chip's text for a match, or null to leave the text as it is. */
  readonly label: (match: RegExpExecArray) => string | null;
}

class Chip extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  override eq(other: Chip): boolean {
    return other.label === this.label;
  }
  toDOM(): HTMLElement {
    const node = document.createElement('span');
    node.className = 'cm-atom';
    node.textContent = this.label;
    return node;
  }
}

export function atoms(kind: AtomKind): Extension {
  const matcher = new MatchDecorator({
    regexp: kind.regexp,
    decorate: (add, from, to, match) => {
      const label = kind.label(match);
      if (label !== null)
        add(from, to, Decoration.replace({ widget: new Chip(label) }));
    },
  });
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations);
      }
    },
    {
      decorations: (each) => each.decorations,
      provide: (self) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(self)?.decorations ?? Decoration.none,
        ),
    },
  );
  return plugin;
}

/** A known `/name` at the start of a word, as a chip. */
export function slashAtoms(known: ReadonlySet<string>): Extension {
  return atoms({
    regexp: /(?<=^|\s)\/([\w:.-]+)(?=\s|$)/g,
    label: (match) => (known.has(match[1]!) ? match[0] : null),
  });
}
