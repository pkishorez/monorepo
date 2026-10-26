import type {
  AgentQuestion,
  QuestionAnswer,
  QuestionItem,
} from '@kestack/connect/code';
import { Drafts, ItemDraft } from '../../../../../connections.ts';

/*
 * An Agent Question's answer as it is being given, one Item at a time:
 * the options chosen, what is typed, and whether the typed answer is
 * chosen. A single choice is one option or the typed answer, so choosing
 * one lets go of the other, though what was typed stays to come back to;
 * several choices are any options and the typed answer beside them. An
 * Item with no options is answered only by typing. What is sent is the
 * labels chosen, in the options' order, then what was typed: trimmed, but
 * a secret as typed. Its shape is its Connection's, which keeps it while the
 * question is asked (`Answering`).
 */

export { Drafts, ItemDraft };

const EMPTY: ItemDraft = { chosen: [], typed: '', other: false };

/** An Item's answer so far, or none. */
export const draftOf = (drafts: Drafts | undefined, item: QuestionItem) =>
  drafts?.[item.id] ?? EMPTY;

/** Whether the typed answer can be given: always without options, else when the harness lets it. */
export const typable = (item: QuestionItem) =>
  item.options.length === 0 || item.other;

/** An option chosen, or, of several, chosen again to let it go. */
export const choose = (
  item: QuestionItem,
  draft: ItemDraft,
  label: string,
): ItemDraft =>
  item.multiSelect
    ? {
        ...draft,
        chosen: draft.chosen.includes(label)
          ? draft.chosen.filter((each) => each !== label)
          : [...draft.chosen, label],
      }
    : { ...draft, chosen: [label], other: false };

/** The typed answer chosen, or, beside options, chosen again to let it go. */
export const chooseOther = (item: QuestionItem, draft: ItemDraft): ItemDraft =>
  item.multiSelect
    ? { ...draft, other: !draft.other }
    : { ...draft, chosen: [], other: true };

/** Typing chooses the typed answer, and, as a single choice, lets the option go. */
export const type = (
  item: QuestionItem,
  draft: ItemDraft,
  typed: string,
): ItemDraft =>
  typed === ''
    ? { ...draft, typed }
    : item.multiSelect
      ? { ...draft, typed, other: true }
      : { ...draft, typed, chosen: [], other: true };

/** What is sent for an Item: the labels chosen, then what was typed. */
export const answerOf = (item: QuestionItem, draft: ItemDraft) => {
  const chosen = item.options
    .map(({ label }) => label)
    .filter((label) => draft.chosen.includes(label));
  const typed = item.secret ? draft.typed : draft.typed.trim();
  const given =
    typable(item) &&
    (draft.other || item.options.length === 0) &&
    draft.typed.trim() !== '';
  return given ? [...chosen, typed] : chosen;
};

/** Whether an Item has an answer to send. */
export const isAnswered = (item: QuestionItem, draft: ItemDraft) =>
  answerOf(item, draft).length > 0;

/** The Items not answered yet, in order. */
export const unanswered = (
  question: AgentQuestion,
  drafts: Drafts | undefined,
) => question.items.filter((item) => !isAnswered(item, draftOf(drafts, item)));

/** The answer to send, every Item answered. */
export const answerFor = (
  question: AgentQuestion,
  drafts: Drafts | undefined,
): QuestionAnswer =>
  Object.fromEntries(
    question.items.map((item) => [
      item.id,
      answerOf(item, draftOf(drafts, item)),
    ]),
  );
