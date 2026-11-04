import type { ReactNode } from 'react';
import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { Change } from '../insert/insert.ts';

/*
 * The one place a Dictation's text goes into the Draft (`useDictated`).
 *
 * A Dictation for this Draft shows where its text will go, as ghost text:
 * while it records, at the cursor, following it as the user places it or
 * types; once stopped, where the cursor was, until its text takes its
 * place. The ghost is what is heard so far, each new word fading in, or
 * "listening…" and "transcribing…" before there are words; "couldn't
 * transcribe — retry" when it was refused. It is no part of the text, so
 * it is never sent, never a step of the history, and never selected: only
 * the words around it are. The selection it stopped on is what the text
 * replaces. The text goes in as any insert does, and takes the ghost out
 * in the same step.
 */

/** The Dictation the Draft waits for: how it stands, and why it failed. */
export interface Awaited {
  readonly id: number;
  readonly failed: boolean;
  readonly reason: string | null;
  /** What is heard so far. */
  readonly ghost: string;
  /** Still recording: it moves with the cursor. */
  readonly follows: boolean;
}

interface Spot extends Awaited {
  readonly from: number;
  readonly to: number;
}

/** Shows the ghost of one, at the cursor if it is new; null takes it out. */
export const awaiting = StateEffect.define<Awaited | null>();

/** What a retry asks, by the Dictation's id. */
export const retrying = Facet.define<
  (id: number) => void,
  (id: number) => void
>({ combine: (all) => all.at(-1) ?? (() => {}) });

/**
 * Brings the end of `node` into view in the box that scrolls the words,
 * never the page: the newest words heard stay in sight as they come.
 */
const showEnd = (node: HTMLElement) =>
  requestAnimationFrame(() => {
    let box = node.parentElement;
    while (box !== null && box !== document.body) {
      const { overflowY } = getComputedStyle(box);
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        box.scrollHeight > box.clientHeight
      )
        break;
      box = box.parentElement;
    }
    if (box === null || box === document.body) return;
    const below =
      node.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;
    if (below > 0) box.scrollTop += below + 4;
  });

/** A word, fading in as it comes. */
const word = (text: string, fresh: boolean) => {
  const node = document.createElement('span');
  if (fresh) node.className = 'cm-ghost-new';
  node.textContent = text;
  return node;
};

class Ghost extends WidgetType {
  constructor(
    readonly spot: Awaited,
    /** A space goes before it: the text before it ends in a word. */
    readonly spaced: boolean,
  ) {
    super();
  }
  /** What it shows: the words, a space before them if one is needed. */
  get words() {
    return this.spot.ghost === ''
      ? ''
      : `${this.spaced ? ' ' : ''}${this.spot.ghost}`;
  }
  override eq(other: Ghost) {
    return (
      other.spot.id === this.spot.id &&
      other.spot.failed === this.spot.failed &&
      other.spot.reason === this.spot.reason &&
      other.spot.follows === this.spot.follows &&
      other.words === this.words
    );
  }
  toDOM(view: EditorView): HTMLElement {
    const node = document.createElement('span');
    node.className = 'cm-dictation';
    if (this.spot.failed) {
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
    node.setAttribute('role', 'status');
    this.fill(node, '');
    return node;
  }
  /**
   * Shows its words in `node`, which shows `before`: only those after
   * fade in when the words carry on from them; all of them otherwise.
   */
  private fill(node: HTMLElement, before: string) {
    const words = this.words;
    if (words === '') {
      delete node.dataset['ghost'];
      node.textContent = this.spot.follows ? 'listening…' : 'transcribing…';
    } else {
      node.dataset['ghost'] = '';
      if (before !== '' && words.startsWith(before))
        node.appendChild(word(words.slice(before.length), true));
      else node.replaceChildren(word(words, before === ''));
      if (words !== before) showEnd(node);
    }
    node.dataset['shown'] = words;
  }
  // The same ghost with more words: only the new ones come in.
  override updateDOM(node: HTMLElement) {
    if (this.spot.failed || node.dataset['failed'] !== undefined) return false;
    this.fill(node, node.dataset['shown'] ?? '');
    return true;
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
        next = { ...next, ...value };
      else {
        const { from, to } = transaction.startState.selection.main;
        next = { ...value, from, to };
      }
    }
    // Recording, it goes where the cursor goes.
    if (next !== null && next.follows && transaction.selection !== undefined) {
      const { from, to } = transaction.newSelection.main;
      next = { ...next, from, to };
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.compute([field], (state) => {
      const now = state.field(field);
      if (now === null) return Decoration.none;
      const before =
        now.from === 0 ? '' : state.doc.sliceString(now.from - 1, now.from);
      return Decoration.set([
        Decoration.widget({
          widget: new Ghost(now, before !== '' && !/\s/.test(before)),
          side: 1,
        }).range(now.to),
      ]);
    }),
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

/** A Dictation coming to this Draft: on its way, refused, or its text. */
export type Pending =
  | {
      readonly _tag: 'Transcribing';
      readonly id: number;
      /** What is heard so far, as it comes. */
      readonly heard?: ReactNode;
    }
  | { readonly _tag: 'Failed'; readonly id: number; readonly reason: string }
  | { readonly _tag: 'Text'; readonly id: number; readonly text: string };

/** What is heard so far for this Draft, while one records or is written out. */
export interface Live {
  readonly id: number;
  readonly text: string;
}

/**
 * Shows where the Dictation `pending` waits, or the one recording, `live`,
 * goes, as ghost text; puts its text in once, as it is there to take, then
 * says so through `onTook`.
 */
export function useDictated(
  editor: {
    readonly awaiting: (awaited: Awaited | null) => void;
    readonly insert: (put: {
      readonly _tag: 'Dictated';
      readonly id: number;
      readonly text: string;
    }) => boolean;
  },
  pending: Pending | null,
  live: Live | null,
  onTook: (id: number) => void,
  disabled: boolean,
) {
  const took = useRef<number | null>(null);
  const latest = useRef(onTook);
  latest.current = onTook;
  useEffect(() => {
    if (pending === null)
      return editor.awaiting(
        live === null
          ? null
          : {
              id: live.id,
              failed: false,
              reason: null,
              ghost: live.text,
              follows: true,
            },
      );
    if (pending._tag !== 'Text') {
      editor.awaiting({
        id: pending.id,
        failed: pending._tag === 'Failed',
        reason: pending._tag === 'Failed' ? pending.reason : null,
        ghost: pending._tag === 'Failed' ? '' : (live?.text ?? ''),
        follows: false,
      });
      return;
    }
    if (took.current === pending.id) return;
    const { id, text } = pending;
    if (!editor.insert({ _tag: 'Dictated', id, text })) return;
    took.current = pending.id;
    latest.current(pending.id);
  }, [pending?._tag, pending?.id, live?.id, live?.text, disabled]);
}
