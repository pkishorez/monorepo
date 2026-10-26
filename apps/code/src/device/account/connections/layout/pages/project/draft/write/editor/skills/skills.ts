import {
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

/*
 * Skills in the Draft's text.
 *
 * 1. Open    a `/` typed at the start of a word is written, then handed
 *            on, so the Composer can open its skills Picker; `a/b` and
 *            `http://` stay plain text.
 * 2. Put in  a name picked there takes that `/`'s place as `/name `;
 *            picked with no `/` to replace, it goes in at the cursor, over
 *            the selection.
 * 3. Atom    what a pick puts in is marked, as it goes in, as one unit: a
 *            chip the cursor steps over and Backspace removes whole. The
 *            text stays in the document, so what is sent is what was
 *            written. Only a pick makes one: a `/name` typed, pasted or
 *            read back is plain text. The marks go with the text when the
 *            editor moves to another of its texts and back.
 */

const startsWord = (view: EditorView, at: number) =>
  at === 0 || /\s/.test(view.state.sliceDoc(at - 1, at));

/** 1. Open: hands on a `/` typed at the start of a word, at its position. */
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
 * 2. Put in: the change that puts the skill `name` in over the selection
 * `from` to `to` of `text`, as `/name `: on the `/` typed just before it
 * when `typed`, else apart from the word before it.
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

// 3. Atom

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

const chip = (label: string) => Decoration.replace({ widget: new Chip(label) });

/** A skill's `/name` that went in, by where it is in the text after. */
const picked = StateEffect.define<{ from: number; to: number }>();

/** A Skill's atom, at its `/name` within what went in at `from`. */
export const skillAtom = (
  made: { readonly from: number; readonly insert: string },
  name: string,
) => {
  const at = made.from + made.insert.indexOf(`/${name}`);
  return picked.of({ from: at, to: at + name.length + 1 });
};

interface Marked {
  readonly from: number;
  readonly to: number;
  readonly label: string;
}

const atoms = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (marks, transaction) => {
    let next = marks.map(transaction.changes);
    const added: Array<Range<Decoration>> = [];
    for (const effect of transaction.effects)
      if (effect.is(picked) && effect.value.from < effect.value.to)
        added.push(
          chip(
            transaction.state.sliceDoc(effect.value.from, effect.value.to),
          ).range(effect.value.from, effect.value.to),
        );
    if (added.length > 0) next = next.update({ add: added, sort: true });
    // An atom whose text went goes with it.
    return transaction.docChanged
      ? next.update({ filter: (from, to) => from < to })
      : next;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
  // Kept with its text when the editor shows another and comes back.
  toJSON: (marks) => {
    const all: Array<Marked> = [];
    marks.between(0, Number.MAX_SAFE_INTEGER, (from, to, mark) => {
      const widget = mark.spec.widget as Chip | undefined;
      all.push({ from, to, label: widget?.label ?? '' });
    });
    return all;
  },
  fromJSON: (json: ReadonlyArray<Marked>) =>
    Decoration.set(
      json.map(({ from, to, label }) => chip(label).range(from, to)),
      true,
    ),
});

/** Draws each Skill picked as its atom; the editor keeps it with its text. */
export const skillAtoms = atoms;
