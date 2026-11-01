import type { QuestionItem } from '@kestack/connect/code';
import type { RefObject } from 'react';
import { keys } from '../../../../../commands.ts';
import type { ItemDraft } from '../answer.ts';
import { OTHER, ROW } from './step/step.tsx';

/*
 * The `question` Surface's keys, over the step drawn in `step`, while the
 * dialog is expanded. Focus is in it, so they are plain keys in either
 * Mode. Each moves focus between the rows, or does what a click on the
 * row the keys are on would:
 *
 * - `j` and `k`, or the arrows, go from row to row; of one choice, the
 *   option reached is chosen, as a radio group's arrows choose.
 * - Space or `x` chooses, or lets go of one of several; on one's own
 *   answer with nothing typed, edits it. Where it can be dictated, Space
 *   on it dictates it instead, or stops the one recording (`step/voice.tsx`).
 * - Enter, of one choice, chooses and goes on; of several, goes on; on
 *   one's own answer, edits it while nothing is typed, else takes it and
 *   goes on. On the last step, going on is sending.
 * - 1 to 9 choose that option; `i` edits one's own answer.
 * - Ctrl+J and Ctrl+K, even while typing, `l` and `h`, Tab and Shift+Tab,
 *   and Right and Left go to the next and the last question.
 * - Mod+Enter sends, even while typing; `q` asks to skip, and `q` or
 *   Enter again skips; `m` minimises; Escape lets go of skipping, else
 *   minimises. Typing in a field, Escape and Enter are the field's.
 */

export function useStepKeys({
  step,
  item,
  draft,
  on,
  skipping,
  go,
  primary,
  send,
  skip,
  minimise,
  onChoose,
  onChooseOther,
  dictate,
}: {
  /** The step drawn: its rows are the keys'. */
  readonly step: RefObject<HTMLElement | null>;
  readonly item: QuestionItem;
  readonly draft: ItemDraft;
  readonly on: boolean;
  /** Whether skipping waits on a second ask. */
  readonly skipping: boolean;
  /** To the next question, or the last. */
  readonly go: (by: 1 | -1) => void;
  /** What the dialog's main button does: on, or send on the last. */
  readonly primary: () => void;
  readonly send: () => void;
  /** Ask to skip, or, asked, skip; false lets go of asking. */
  readonly skip: (on: boolean) => void;
  readonly minimise: () => void;
  readonly onChoose: (label: string) => void;
  readonly onChooseOther: () => void;
  /** Starts or stops a Dictation of one's own answer, where it can be dictated. */
  readonly dictate: RefObject<(() => void) | null>;
}) {
  const rows = () => [
    ...(step.current?.querySelectorAll<HTMLElement>(ROW) ?? []),
  ];
  const current = () => {
    const now = document.activeElement;
    return now instanceof HTMLElement
      ? (now.closest<HTMLElement>(ROW) ?? null)
      : null;
  };
  const isOther = (row: HTMLElement) => row.matches(OTHER);
  const labelOf = (row: HTMLElement) =>
    item.options[Number(row.dataset['option']) - 1]?.label;
  const reveal = (row: HTMLElement) => {
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
  };
  /** Of one choice, the row reached is chosen; one's own, once typed. */
  const follow = (row: HTMLElement) => {
    if (item.multiSelect) return;
    const label = labelOf(row);
    if (label !== undefined) onChoose(label);
    else if (isOther(row) && !draft.other && draft.typed.trim() !== '')
      onChooseOther();
  };
  const by = (move: 1 | -1) => {
    const all = rows();
    const now = current();
    const at = now === null ? -1 : all.indexOf(now);
    const next =
      at === -1
        ? move > 0
          ? all[0]
          : all.at(-1)
        : all[Math.min(all.length - 1, Math.max(0, at + move))];
    if (next === undefined || next === now) return;
    reveal(next);
    follow(next);
  };
  const toggle = () => {
    const row = current() ?? rows()[0];
    if (row === undefined) return;
    if (!isOther(row)) return row.click();
    if (draft.typed === '' || item.options.length === 0) row.click();
    else if (item.multiSelect || !draft.other) onChooseOther();
  };
  const space = () => {
    const row = current();
    if (row !== null && isOther(row) && dictate.current !== null)
      return dictate.current();
    toggle();
  };
  const pick = () => {
    if (skipping) return skip(true);
    const row = current();
    if (row !== null && isOther(row)) {
      if (draft.typed.trim() === '') return row.click();
      if (!draft.other) onChooseOther();
      return primary();
    }
    if (row !== null && !item.multiSelect) {
      const label = labelOf(row);
      if (label !== undefined) onChoose(label);
    }
    primary();
  };
  const option = (n: number) => () => {
    const row = step.current?.querySelector<HTMLElement>(
      `[data-option="${n}"]`,
    );
    if (row === null || row === undefined) return;
    reveal(row);
    row.click();
  };
  const write = () => {
    step.current?.querySelector<HTMLElement>(OTHER)?.click();
  };
  const enabled = { enabled: on };
  keys.useAction('question.down', () => by(1), enabled);
  keys.useAction('question.up', () => by(-1), enabled);
  keys.useAction('question.nextItem', () => go(1), enabled);
  keys.useAction('question.previousItem', () => go(-1), enabled);
  keys.useAction('question.right', () => go(1), enabled);
  keys.useAction('question.left', () => go(-1), enabled);
  keys.useAction('question.space', space, enabled);
  keys.useAction('question.toggle', toggle, enabled);
  keys.useAction('question.pick', pick, enabled);
  keys.useAction('question.option1', option(1), enabled);
  keys.useAction('question.option2', option(2), enabled);
  keys.useAction('question.option3', option(3), enabled);
  keys.useAction('question.option4', option(4), enabled);
  keys.useAction('question.option5', option(5), enabled);
  keys.useAction('question.option6', option(6), enabled);
  keys.useAction('question.option7', option(7), enabled);
  keys.useAction('question.option8', option(8), enabled);
  keys.useAction('question.option9', option(9), enabled);
  keys.useAction('question.write', write, enabled);
  keys.useAction('question.send', send, enabled);
  keys.useAction('question.decline', () => skip(true), enabled);
  keys.useAction('question.minimise', minimise, enabled);
  keys.useAction(
    'question.close',
    () => (skipping ? skip(false) : minimise()),
    enabled,
  );
}
