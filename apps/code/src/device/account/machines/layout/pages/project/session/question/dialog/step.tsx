import type { QuestionItem } from '@kestack/connect/code';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { CheckIcon, CircleAlertIcon } from 'lucide-react';
import { type KeyboardEvent, useId, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { type ItemDraft, typable } from '../answer.ts';

/*
 * One Item, the dialog's step: its header, its question, whether one or
 * any may be chosen, and its rows, drawn as the transcript draws its tool
 * lines. An option is a row with its mark, round for one choice and
 * square for several, its label and, under it, what it means, said once
 * when it only says the label again; with a keyboard, the row the keys
 * are on, or under the pointer, names its number. Chosen, a row is lit
 * and its mark filled; the keys' row has the ring, as the sidebar's.
 *
 * "Other", where the agent allows an answer of one's own, and the one row
 * of an Item with no options, is a row like any other until it is edited:
 * by `i`, Enter, a click or a tap it becomes a field in its place, a
 * secret's hidden, 16px on touch so iOS never zooms; Escape, or leaving
 * it, makes it a row again, saying what was typed, a secret as dots. Enter
 * in it goes on, Tab and Shift+Tab to the next and the last question.
 * Typing chooses it, and, of one choice, lets the option go.
 */

export const ROW = '[data-question-row]';
export const OTHER = '[data-other]';

export function Step({
  index,
  item,
  draft,
  missing,
  touch,
  editing,
  onEditing,
  onChoose,
  onChooseOther,
  onType,
  onNext,
  onStep,
}: {
  readonly index: number;
  readonly item: QuestionItem;
  readonly draft: ItemDraft;
  /** Sent with this Item unanswered: it says so. */
  readonly missing: boolean;
  readonly touch: boolean;
  /** Whether its own answer is being typed. */
  readonly editing: boolean;
  readonly onEditing: (on: boolean) => void;
  readonly onChoose: (label: string) => void;
  readonly onChooseOther: () => void;
  readonly onType: (text: string) => void;
  /** Enter in its field: on, as the dialog's main button. */
  readonly onNext: () => void;
  /** Tab or Shift+Tab in its field: to the next or the last question. */
  readonly onStep: (by: 1 | -1) => void;
}) {
  const id = useId();
  const role = item.multiSelect ? 'checkbox' : 'radio';
  const fieldOnly = item.options.length === 0;
  const hint = fieldOnly
    ? item.secret
      ? 'In your own words, hidden as you type'
      : 'In your own words'
    : item.multiSelect
      ? 'Choose any'
      : 'Choose one';
  return (
    <div
      data-question-item={index}
      role="group"
      aria-labelledby={`${id}-question`}
      aria-describedby={missing ? `${id}-missing` : undefined}
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        {item.header !== '' && (
          <span className="text-xs font-medium text-muted-foreground">
            {item.header}
          </span>
        )}
        <h3
          id={`${id}-question`}
          className={cn(
            'text-base leading-snug font-semibold text-balance',
            touch && 'text-[17px]',
          )}
        >
          {item.question}
        </h3>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div
        role={fieldOnly ? undefined : item.multiSelect ? 'group' : 'radiogroup'}
        aria-labelledby={`${id}-question`}
        className="-mx-2 flex flex-col gap-0.5"
      >
        {item.options.map((option, at) => {
          const checked = draft.chosen.includes(option.label);
          return (
            <button
              key={option.label}
              type="button"
              role={role}
              aria-checked={checked}
              tabIndex={-1}
              data-question-row
              data-option={at + 1}
              onClick={() => onChoose(option.label)}
              className={rowClass(touch)}
            >
              <Mark kind={role} checked={checked} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-foreground">{option.label}</span>
                {/* An agent may say only the label again: it is said once. */}
                {option.description !== '' &&
                  option.description !== option.label && (
                    <span className="text-[13px] leading-snug text-muted-foreground">
                      {option.description}
                    </span>
                  )}
              </span>
              {at < 9 && <Hint>{String(at + 1)}</Hint>}
            </button>
          );
        })}
        {typable(item) && (
          <Own
            item={item}
            draft={draft}
            role={fieldOnly ? null : role}
            placeholder={
              fieldOnly
                ? item.secret
                  ? 'Paste or type it…'
                  : 'Type your answer…'
                : 'Other…'
            }
            touch={touch}
            editing={editing}
            labelledBy={`${id}-question`}
            onEditing={onEditing}
            onChooseOther={onChooseOther}
            onType={onType}
            onNext={onNext}
            onStep={onStep}
          />
        )}
      </div>
      {missing && (
        <p
          id={`${id}-missing`}
          role="alert"
          className="flex items-center gap-1.5 text-xs text-destructive"
        >
          <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
          Needs an answer
        </p>
      )}
    </div>
  );
}

/** A row: a tool line's shape, a finger tall on touch. */
const rowClass = (touch: boolean) =>
  cn(
    'focus-ring group/row flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-start text-sm transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none keyboard:min-h-8',
    'aria-checked:bg-muted aria-checked:hover:bg-muted',
    touch && 'min-h-12 items-center py-2.5 text-[15px] active:bg-muted/60',
  );

/** Its number, on the row the keys are on or under the pointer. */
function Hint({ children }: { readonly children: string }) {
  return (
    <kbd
      aria-hidden
      className="pointer-events-none mt-px hidden h-5 min-w-5 shrink-0 items-center justify-center rounded-sm bg-background px-1 font-sans text-[11px] font-medium text-muted-foreground opacity-0 ring-1 ring-border transition-opacity duration-150 group-hover/row:opacity-100 group-focus-visible/row:opacity-100 keyboard:inline-flex motion-reduce:transition-none"
    >
      {children}
    </kbd>
  );
}

/** One's own answer: a row, or, while edited, a field in its place. */
function Own({
  item,
  draft,
  role,
  placeholder,
  touch,
  editing,
  labelledBy,
  onEditing,
  onChooseOther,
  onType,
  onNext,
  onStep,
}: {
  readonly item: QuestionItem;
  readonly draft: ItemDraft;
  /** Beside options, a choice; alone, the Item's one row. */
  readonly role: 'radio' | 'checkbox' | null;
  readonly placeholder: string;
  readonly touch: boolean;
  readonly editing: boolean;
  readonly labelledBy: string;
  readonly onEditing: (on: boolean) => void;
  readonly onChooseOther: () => void;
  readonly onType: (text: string) => void;
  readonly onNext: () => void;
  readonly onStep: (by: 1 | -1) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLButtonElement>(null);
  const typed = draft.typed;
  const checked = role === null ? typed.trim() !== '' : draft.other;
  // Out of the field by Escape: back on its row, so the keys go on.
  const was = useRef(editing);
  useLayoutEffect(() => {
    const left = was.current && !editing;
    was.current = editing;
    const now = document.activeElement;
    if (left && (now === null || now === document.body))
      row.current?.focus({ preventScroll: true });
  }, [editing]);
  /** Edited, in the same tap, so the on-screen keyboard rises for it. */
  const edit = () => {
    if (typed.trim() !== '' && !draft.other && role === 'radio')
      onChooseOther();
    flushSync(() => onEditing(true));
    field.current?.focus({ preventScroll: true });
    field.current?.scrollIntoView({ block: 'nearest' });
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    if (event.key === 'Escape') {
      event.preventDefault();
      onEditing(false);
    } else if (event.key === 'Enter' && plain) {
      event.preventDefault();
      onEditing(false);
      onNext();
    } else if (event.key === 'Tab' && plain) {
      event.preventDefault();
      onStep(event.shiftKey ? -1 : 1);
    }
  };
  if (editing)
    return (
      <div
        data-question-row
        data-other
        data-editing
        className={cn(
          // Being typed in: lit in Insert Mode's colour, as the status
          // line says it, apart from the keys' ring on a row.
          'flex w-full items-center gap-2.5 rounded-md bg-background px-2 py-1 text-sm shadow-[0_0_0_3px_color-mix(in_oklab,var(--vim-insert)_18%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--vim-insert)_75%,transparent)] keyboard:min-h-8',
          touch && 'min-h-12 py-1.5',
        )}
      >
        {role !== null && <Mark kind={role} checked={checked} />}
        <input
          ref={field}
          data-question-field
          type={item.secret ? 'password' : 'text'}
          value={typed}
          autoComplete="off"
          autoCorrect={item.secret ? 'off' : undefined}
          autoCapitalize={item.secret ? 'off' : undefined}
          spellCheck={!item.secret}
          data-1p-ignore={item.secret ? undefined : true}
          enterKeyHint="next"
          aria-labelledby={labelledBy}
          placeholder={role === null ? placeholder : 'Type your own answer'}
          onChange={(event) => onType(event.currentTarget.value)}
          onKeyDown={keyDown}
          onBlur={() => onEditing(false)}
          className={cn(
            'h-6 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground',
            touch && 'h-9 text-base',
          )}
        />
      </div>
    );
  const said =
    typed === ''
      ? null
      : item.secret
        ? '•'.repeat(Math.min(12, typed.length))
        : typed;
  return (
    <button
      ref={row}
      type="button"
      role={role ?? undefined}
      aria-checked={role === null ? undefined : checked}
      aria-label={
        said === null
          ? role === null
            ? placeholder.replace('…', '')
            : 'Other: type your own answer'
          : `${role === null ? 'Your answer' : 'Other'}: ${item.secret ? 'hidden' : typed}`
      }
      tabIndex={-1}
      data-question-row
      data-other
      onClick={edit}
      className={rowClass(touch)}
    >
      {role !== null && <Mark kind={role} checked={checked} />}
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          said === null ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {said ?? placeholder}
      </span>
      <Hint>i</Hint>
    </button>
  );
}

/** A choice's mark: a round one for one choice, a square for several. */
function Mark({
  kind,
  checked,
}: {
  readonly kind: 'radio' | 'checkbox';
  readonly checked: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 flex size-4 shrink-0 items-center justify-center border border-foreground/25 text-primary-foreground transition-colors duration-150 motion-reduce:transition-none',
        kind === 'radio' ? 'rounded-full' : 'rounded-[4px]',
        checked && 'border-primary bg-primary',
      )}
    >
      {checked &&
        (kind === 'radio' ? (
          <span className="size-1.5 rounded-full bg-primary-foreground" />
        ) : (
          <CheckIcon className="size-3" strokeWidth={3} />
        ))}
    </span>
  );
}
