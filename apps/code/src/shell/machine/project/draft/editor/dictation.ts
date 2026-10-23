import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { Change } from './insert.ts';

/*
 * A Dictation on its way into the Draft: a placeholder where the cursor
 * was as it stopped, "transcribing…", until its text takes its place, or
 * "couldn't transcribe — retry" when it was refused. The placeholder is no
 * part of the text, so it is never sent and never a step of the history;
 * the selection it stopped on is what the text replaces. The text goes in
 * as any insert does, and takes the placeholder out in the same step.
 */

/** The Dictation the Draft waits for: how it stands, and why it failed. */
export interface Awaited {
  readonly id: number;
  readonly failed: boolean;
  readonly reason: string | null;
}

interface Spot extends Awaited {
  readonly from: number;
  readonly to: number;
}

/** Shows the placeholder of one, at the cursor if it is new; null takes it out. */
export const awaiting = StateEffect.define<Awaited | null>();

/** What a retry asks, by the Dictation's id. */
export const retrying = Facet.define<
  (id: number) => void,
  (id: number) => void
>({ combine: (all) => all.at(-1) ?? (() => {}) });

class Placeholder extends WidgetType {
  constructor(readonly spot: Awaited) {
    super();
  }
  override eq(other: Placeholder) {
    return (
      other.spot.id === this.spot.id &&
      other.spot.failed === this.spot.failed &&
      other.spot.reason === this.spot.reason
    );
  }
  toDOM(view: EditorView): HTMLElement {
    const node = document.createElement('span');
    node.className = 'cm-dictation';
    if (!this.spot.failed) {
      node.setAttribute('role', 'status');
      node.textContent = 'transcribing…';
      return node;
    }
    node.dataset['failed'] = '';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'couldn’t transcribe — retry';
    if (this.spot.reason !== null) retry.title = this.spot.reason;
    const { id } = this.spot;
    retry.addEventListener('click', () => view.state.facet(retrying)(id));
    node.appendChild(retry);
    return node;
  }
  // Its button is clicked, not the editor under it.
  override ignoreEvent() {
    return true;
  }
}

const spot = StateField.define<Spot | null>({
  create: () => null,
  update: (now, transaction) => {
    let next: Spot | null =
      now === null
        ? null
        : now.from === now.to
          ? {
              ...now,
              from: transaction.changes.mapPos(now.from, -1),
              to: transaction.changes.mapPos(now.to, -1),
            }
          : {
              ...now,
              from: transaction.changes.mapPos(now.from, 1),
              to: Math.max(
                transaction.changes.mapPos(now.from, 1),
                transaction.changes.mapPos(now.to, -1),
              ),
            };
    for (const effect of transaction.effects) {
      if (!effect.is(awaiting)) continue;
      const { value } = effect;
      if (value === null) next = null;
      else if (next !== null && next.id === value.id)
        next = { ...next, failed: value.failed, reason: value.reason };
      else {
        const { from, to } = transaction.startState.selection.main;
        next = { ...value, from, to };
      }
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (now) =>
      now === null
        ? Decoration.none
        : Decoration.set([
            Decoration.widget({
              widget: new Placeholder(now),
              side: 1,
            }).range(now.to),
          ]),
    ),
});

export const dictation: Extension = spot;

/** The Dictation the Draft shows now, if any. */
export const awaitedIn = (state: EditorState): Awaited | null =>
  state.field(spot, false) ?? null;

/**
 * The text of Dictation `id`, where its placeholder is, or at the cursor
 * without one; a word typed right before it gets a space between.
 */
export const dictatedChange =
  (id: number, text: string): Change =>
  (state) => {
    const at = state.field(spot, false);
    const { from, to } =
      at !== null && at !== undefined && at.id === id
        ? at
        : state.selection.main;
    const before = from === 0 ? '' : state.doc.sliceString(from - 1, from);
    return {
      from,
      to,
      insert: before === '' || /\s/.test(before) ? text : ` ${text}`,
    };
  };
