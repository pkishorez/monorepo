import { Match } from 'effect';

/** A Transfer being composed: who sends, then who receives. */
export type Draft =
  | { readonly kind: 'empty' }
  | { readonly kind: 'sender-chosen'; readonly from: string }
  | {
      readonly kind: 'receiver-chosen';
      readonly from: string;
      readonly to: string;
    };

/** What the ledger lets the user do to the Draft. */
export type DraftIntent =
  | { readonly type: 'choose'; readonly id: string }
  | { readonly type: 'clear' }
  | { readonly type: 'drop-receiver' }
  | { readonly type: 'sent'; readonly stay: boolean };

export const EMPTY_DRAFT: Draft = { kind: 'empty' };

const senderChosen = (from: string): Draft => ({ kind: 'sender-chosen', from });
const receiverChosen = (from: string, to: string): Draft => ({
  kind: 'receiver-chosen',
  from,
  to,
});

/** Tapping an account: first tap names the sender, second the receiver; tapping a chosen account un-chooses it. */
const choose = (draft: Draft, id: string): Draft =>
  Match.value(draft).pipe(
    Match.when({ kind: 'empty' }, () => senderChosen(id)),
    Match.when({ kind: 'sender-chosen' }, ({ from }) =>
      id === from ? EMPTY_DRAFT : receiverChosen(from, id),
    ),
    Match.when({ kind: 'receiver-chosen' }, ({ from, to }) =>
      id === from
        ? EMPTY_DRAFT
        : id === to
          ? senderChosen(from)
          : receiverChosen(from, id),
    ),
    Match.exhaustive,
  );

export const reduceDraft = (draft: Draft, intent: DraftIntent): Draft =>
  Match.value(intent).pipe(
    Match.when({ type: 'choose' }, ({ id }) => choose(draft, id)),
    Match.when({ type: 'clear' }, () => EMPTY_DRAFT),
    Match.when({ type: 'drop-receiver' }, () =>
      draft.kind === 'receiver-chosen' ? senderChosen(draft.from) : draft,
    ),
    Match.when({ type: 'sent' }, ({ stay }) =>
      draft.kind === 'receiver-chosen' && !stay
        ? senderChosen(draft.from)
        : draft,
    ),
    Match.exhaustive,
  );

export const senderOf = (draft: Draft): string | null =>
  draft.kind === 'empty' ? null : draft.from;

export const receiverOf = (draft: Draft): string | null =>
  draft.kind === 'receiver-chosen' ? draft.to : null;
