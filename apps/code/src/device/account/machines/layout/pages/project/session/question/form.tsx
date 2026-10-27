import type { AgentQuestion, QuestionItem } from '@kestack/connect/code';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Input } from '@kestack/web-platform/ui/components/input';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  MessageCircleQuestionMarkIcon,
} from 'lucide-react';
import {
  type PointerEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { keys, useBound } from '../../../../commands.ts';
import {
  draftOf,
  type Drafts,
  isAnswered,
  type ItemDraft,
  typable,
  unanswered,
} from './answer.ts';
import type { Stop } from './question.ts';

/*
 * The Question Panel expanded: every Item in one list that scrolls, so all
 * of it can be read and checked before it is sent, under a header that
 * says who asks, how many are answered and minimises it, and, for more
 * than one, a row of their headers that says which are answered and goes
 * to each. An Item is its header, its question, and its options, round for
 * one choice and square for several, numbered, each with what it means
 * under its label, said once when it only says the label again; then,
 * where the agent allows one, "Other" with a field for an answer of one's
 * own, a secret's hidden as it is typed; an Item with no options is the
 * field alone. At the foot, Stop while the Turn runs, apart, then Skip,
 * which lets the agent carry on without an answer, and Send. Sending with
 * an Item unanswered sends nothing: each one left says so, and the first
 * is gone to.
 *
 * It is the `question` Surface, inside the page's, so the sidebar's and
 * the Pickers' keys work from it too. A row is a choice, or a field's
 * frame: the arrows, or `j` and `k`, go from row to row, Left and Right,
 * or `h` and `l`, from question to question, Space chooses, Enter chooses
 * and goes on to the next question, 1 to 9 choose that option of the
 * question focused, `i` goes into its field, Mod+Enter sends, `d` skips,
 * and Escape leaves a field for its row, then minimises. Tab goes through
 * every row, field and button. On touch it is a sheet, its rows and
 * fields a finger tall and its fields 16px, so iOS never zooms; a swipe
 * down its head minimises it, and its foot stays over the on-screen
 * keyboard.
 */

const ROW = '[data-question-row]';
const ITEM = '[data-question-item]';
const FIELD = 'input[data-question-field]';

export function Form({
  question,
  drafts,
  tried,
  sending,
  touch,
  agent,
  stop,
  expanded,
  claim,
  onChoose,
  onChooseOther,
  onType,
  onSend,
  onDecline,
  onMinimise,
}: {
  readonly question: AgentQuestion;
  readonly drafts: Drafts | undefined;
  /** Sent once with an Item unanswered: the ones left are marked. */
  readonly tried: boolean;
  /** Being answered or declined, while it is. */
  readonly sending: { readonly declining: boolean } | null;
  /** Drawn as a sheet, for a device with no keyboard. */
  readonly touch: boolean;
  readonly agent: string;
  readonly stop: Stop | null;
  readonly expanded: boolean;
  /** As it expands: whether it takes focus. */
  readonly claim: () => boolean;
  readonly onChoose: (itemId: string, label: string) => void;
  readonly onChooseOther: (itemId: string) => void;
  readonly onType: (itemId: string, text: string) => void;
  readonly onSend: () => void;
  readonly onDecline: () => void;
  readonly onMinimise: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const many = question.items.length > 1;
  const left = unanswered(question, drafts);
  const [current, setCurrent] = useState(0);
  const sendButton = useRef<HTMLButtonElement>(null);
  const moves = useMoves(root, sendButton, question, expanded, onMinimise);
  const last = useRef<HTMLElement | null>(null);

  // Expanded, focus goes to the row it was on, else the first question
  // unanswered: when the user asked for it, or when nothing else has it.
  const { enter } = keys.useKeyboard();
  useLayoutEffect(() => {
    if (!expanded || touch || !claim()) return;
    if (last.current?.isConnected === true)
      last.current.focus({ preventScroll: true });
    else moves.toItem(firstLeft(question, drafts));
    // Focus already there says nothing: the keys are told.
    enter('question');
  }, [expanded]);

  // Back from what was drawn over it, such as Actions, focus goes back to
  // the row it left, not to the panel, so the arrows go on from there.
  const { active } = keys.useSurface('question');
  useEffect(() => {
    if (!active || !expanded) return;
    const frame = requestAnimationFrame(() => {
      const now = document.activeElement;
      const within =
        now instanceof HTMLElement &&
        now !== root.current &&
        root.current?.contains(now) === true;
      if (!within && last.current?.isConnected === true)
        last.current.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  const send = () => {
    if (left.length > 0) moves.toItem(question.items.indexOf(left[0]!));
    onSend();
  };
  keys.useAction('question.send', send, { enabled: expanded });
  keys.useAction('question.decline', onDecline, { enabled: expanded });

  const sendKeys = useBound('question.send');
  const minimiseKeys = useBound('content.questionAnywhere');
  const answeredCount = question.items.length - left.length;
  const swipe = useSwipeDown(root, touch && expanded, onMinimise);
  const covered = useCoveredBottom(touch && expanded, root);
  const title = many ? `${agent} asks` : header(question, agent);
  return (
    <keys.Surface id="question" asChild>
      <div
        ref={root}
        role="region"
        aria-label={`${agent}’s question`}
        aria-busy={sending !== null}
        // Only a choice or a field is gone back to, never a button.
        onFocus={(event) => {
          if (event.target.matches(`${ROW}, ${FIELD}`))
            last.current = event.target;
        }}
        style={touch ? { paddingBottom: covered } : undefined}
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          touch &&
            'rounded-t-2xl border-t border-border bg-background shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.18)]',
        )}
      >
        <div
          {...swipe}
          className={cn(
            'mx-auto flex w-full max-w-4xl shrink-0 flex-col px-4 sm:px-6',
            touch && 'touch-none select-none',
          )}
        >
          {touch && (
            <span
              aria-hidden
              className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/30"
            />
          )}
          <div
            className={cn(
              'flex items-center gap-2 pt-4 pb-3',
              touch && 'pt-2 pb-2',
            )}
          >
            <MessageCircleQuestionMarkIcon
              aria-hidden
              className="size-4 shrink-0 text-sky-600 dark:text-sky-400"
            />
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
              {title}
            </h2>
            {many && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {answeredCount} of {question.items.length} answered
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Minimise the question"
              title={
                minimiseKeys === null
                  ? 'Minimise, to read the session'
                  : `Minimise, to read the session (${minimiseKeys})`
              }
              onClick={onMinimise}
              className="-mr-1.5 text-muted-foreground pointer-coarse:size-11"
            >
              <ChevronDownIcon aria-hidden />
            </Button>
          </div>
          {many && (
            <nav
              aria-label="Questions"
              className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-3 [scrollbar-width:none]"
            >
              {question.items.map((item, at) => {
                const done = isAnswered(item, draftOf(drafts, item));
                const missing = tried && !done;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={current === at ? 'step' : undefined}
                    onClick={() => moves.toItem(at)}
                    className={cn(
                      'focus-ring flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground motion-reduce:transition-none',
                      'aria-[current=step]:border-foreground/30 aria-[current=step]:text-foreground',
                      missing && 'border-destructive/50 text-destructive',
                      touch && 'h-9 text-[13px]',
                    )}
                  >
                    {done ? (
                      <CheckIcon aria-label="Answered" className="size-3.5" />
                    ) : (
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full bg-current opacity-60"
                      />
                    )}
                    {item.header || `Question ${at + 1}`}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-4 pt-5 pb-6 sm:px-6">
            {question.items.map((item, at) => (
              <ItemView
                key={item.id}
                index={at}
                item={item}
                titled={many}
                draft={draftOf(drafts, item)}
                missing={tried && !isAnswered(item, draftOf(drafts, item))}
                touch={touch}
                onFocus={() => setCurrent(at)}
                onChoose={(label) => onChoose(item.id, label)}
                onChooseOther={() => onChooseOther(item.id)}
                onType={(text) => onType(item.id, text)}
                onNext={() => moves.toItem(at + 1)}
              />
            ))}
          </div>
        </div>
        <div
          className={cn(
            'shrink-0 border-t border-border',
            touch && 'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
          )}
        >
          <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 py-3 sm:px-6">
            {stop !== null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={stop.disabled || stop.stopping}
                title="Stop the turn"
                onClick={stop.run}
                className="mr-auto rounded-full pointer-coarse:h-11 pointer-coarse:px-4"
              >
                {stop.stopping && <Spinner />}
                Stop
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={sending !== null}
              title="Let the agent carry on without your answer"
              onClick={onDecline}
              className={cn(
                'text-muted-foreground',
                stop === null && 'mr-auto',
                touch && 'h-11 px-4 text-[15px]',
              )}
            >
              {sending?.declining === true && <Spinner />}
              Skip
            </Button>
            <span
              aria-hidden
              className="hidden text-[11px] text-muted-foreground keyboard:inline"
            >
              {sendKeys}
            </span>
            <Button
              ref={sendButton}
              type="button"
              disabled={sending !== null}
              onClick={send}
              className={cn(touch && 'h-11 px-5 text-[15px]')}
            >
              {sending?.declining === false && <Spinner />}
              {sending?.declining === false ? 'Sending…' : 'Send answer'}
            </Button>
          </div>
        </div>
      </div>
    </keys.Surface>
  );
}

/** What a single question is called: its header, else who asks. */
const header = (question: AgentQuestion, agent: string) =>
  question.items[0]?.header || `${agent} asks`;

/** The first Item unanswered, else the first. */
const firstLeft = (question: AgentQuestion, drafts: Drafts | undefined) => {
  const [left] = unanswered(question, drafts);
  return left === undefined ? 0 : question.items.indexOf(left);
};

/** One Item: its header, its question, its options and its field. */
function ItemView({
  index,
  item,
  titled,
  draft,
  missing,
  touch,
  onFocus,
  onChoose,
  onChooseOther,
  onType,
  onNext,
}: {
  readonly index: number;
  readonly item: QuestionItem;
  /** Its header shown over it: not for one alone, whose header heads the panel. */
  readonly titled: boolean;
  readonly draft: ItemDraft;
  readonly missing: boolean;
  readonly touch: boolean;
  readonly onFocus: () => void;
  readonly onChoose: (label: string) => void;
  readonly onChooseOther: () => void;
  readonly onType: (text: string) => void;
  /** Enter in its field: on to the next question. */
  readonly onNext: () => void;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const role = item.multiSelect ? 'checkbox' : 'radio';
  const fieldOnly = item.options.length === 0;
  const row = cn(
    'flex w-full cursor-pointer items-start gap-3 rounded-lg border border-input px-3.5 py-2.5 text-start text-sm transition-colors duration-150 outline-none hover:bg-muted/50 motion-reduce:transition-none dark:bg-input/20',
    'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
    'aria-checked:border-primary/40 aria-checked:bg-muted',
    touch && 'min-h-12 py-3 text-[15px]',
  );
  return (
    <fieldset
      data-question-item={index}
      tabIndex={-1}
      onFocus={onFocus}
      aria-labelledby={`${id}-question`}
      aria-describedby={missing ? `${id}-missing` : undefined}
      className="flex min-w-0 scroll-mt-4 flex-col gap-3 outline-none"
    >
      <div className="flex flex-col gap-1">
        {titled && item.header !== '' && (
          <span className="text-xs font-medium text-muted-foreground">
            {item.header}
          </span>
        )}
        <legend
          id={`${id}-question`}
          className={cn(
            'text-[15px] leading-6 font-medium text-pretty text-foreground',
            touch && 'text-base',
          )}
        >
          {item.question}
        </legend>
        {item.multiSelect && (
          <span className="text-xs text-muted-foreground">
            Choose any that apply
          </span>
        )}
      </div>
      {!fieldOnly && (
        <div
          role={item.multiSelect ? 'group' : 'radiogroup'}
          aria-labelledby={`${id}-question`}
          className="flex flex-col gap-2"
        >
          {item.options.map((option, at) => {
            const checked = draft.chosen.includes(option.label);
            return (
              <button
                key={option.label}
                type="button"
                role={role}
                aria-checked={checked}
                data-question-row
                data-option={at + 1}
                onClick={() => onChoose(option.label)}
                className={row}
              >
                <Mark kind={role} checked={checked} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug">
                  <span className="text-foreground">{option.label}</span>
                  {/* An agent may say only the label again: it is said once. */}
                  {option.description !== '' &&
                    option.description !== option.label && (
                      <span className="text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                </span>
                {at < 9 && (
                  <kbd
                    aria-hidden
                    className="hidden size-5 shrink-0 items-center justify-center rounded-md border border-input font-mono text-[10px] text-muted-foreground keyboard:inline-flex"
                  >
                    {at + 1}
                  </kbd>
                )}
              </button>
            );
          })}
          {item.other && (
            <button
              type="button"
              role={role}
              aria-checked={draft.other}
              data-question-row
              data-other
              onClick={() => {
                if (!draft.other || item.multiSelect) onChooseOther();
                // Chosen, its field takes focus in the same tap, so the
                // on-screen keyboard rises for it.
                if (!draft.other) field.current?.focus();
              }}
              className={row}
            >
              <Mark kind={role} checked={draft.other} />
              <span className="flex-1 text-foreground">Other</span>
            </button>
          )}
        </div>
      )}
      {typable(item) && (
        <Field
          id={`${id}-field`}
          field={field}
          item={item}
          draft={draft}
          // Beside options, under "Other"; alone, it is the row.
          row={fieldOnly}
          touch={touch}
          labelledBy={`${id}-question`}
          onType={onType}
          onFocus={() => {
            if (!fieldOnly && !draft.other && !item.multiSelect)
              onChooseOther();
          }}
          onNext={onNext}
        />
      )}
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
    </fieldset>
  );
}

/**
 * An answer of one's own: a secret is hidden as it is typed. Enter goes on
 * to the next question; Escape leaves it for its row, in either Mode.
 */
function Field({
  id,
  field,
  item,
  draft,
  row,
  touch,
  labelledBy,
  onType,
  onFocus,
  onNext,
}: {
  readonly id: string;
  readonly field: RefObject<HTMLInputElement | null>;
  readonly item: QuestionItem;
  readonly draft: ItemDraft;
  /** Its frame is a row the keys move to, Enter or Space going in. */
  readonly row: boolean;
  readonly touch: boolean;
  readonly labelledBy: string;
  readonly onType: (text: string) => void;
  readonly onFocus: () => void;
  readonly onNext: () => void;
}) {
  return (
    <div
      {...(row ? { 'data-question-row': '', 'data-field': '' } : {})}
      tabIndex={row ? -1 : undefined}
      className={cn(
        'rounded-lg outline-none',
        row && 'focus-visible:ring-3 focus-visible:ring-ring/50',
      )}
    >
      <Input
        id={id}
        ref={field}
        data-question-field
        type={item.secret ? 'password' : 'text'}
        value={draft.typed}
        autoComplete="off"
        autoCorrect={item.secret ? 'off' : undefined}
        autoCapitalize={item.secret ? 'off' : undefined}
        spellCheck={!item.secret}
        data-1p-ignore={item.secret ? undefined : true}
        aria-labelledby={labelledBy}
        placeholder={
          item.options.length === 0
            ? item.secret
              ? 'Paste or type it'
              : 'Type your answer'
            : 'Type your own answer'
        }
        onChange={(event) => onType(event.currentTarget.value)}
        onFocus={onFocus}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            leaveField(event.currentTarget);
          } else if (
            event.key === 'Enter' &&
            !event.metaKey &&
            !event.ctrlKey
          ) {
            event.preventDefault();
            onNext();
          }
        }}
        className={cn('h-10', touch && 'h-12 text-base')}
      />
    </div>
  );
}

/** From a field to its row: its frame alone, else its "Other", else its Item. */
const leaveField = (input: HTMLElement) => {
  const item = input.closest<HTMLElement>(ITEM);
  (
    input.closest<HTMLElement>('[data-field]') ??
    item?.querySelector<HTMLElement>('[data-other]') ??
    item
  )?.focus();
};

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
        'mt-0.5 flex size-4 shrink-0 items-center justify-center border border-input text-primary-foreground transition-colors duration-150 motion-reduce:transition-none dark:bg-input/30',
        kind === 'radio' ? 'rounded-full' : 'rounded-[4px]',
        checked && 'border-primary bg-primary dark:bg-primary',
      )}
    >
      {checked &&
        (kind === 'radio' ? (
          <span className="size-1.5 rounded-full bg-primary-foreground" />
        ) : (
          <CheckIcon className="size-3" />
        ))}
    </span>
  );
}

/**
 * The Surface's keys, over the rows drawn in `root`, while it is expanded:
 * each moves focus, or does what a click on the row focused would.
 */
function useMoves(
  root: RefObject<HTMLElement | null>,
  sendButton: RefObject<HTMLButtonElement | null>,
  question: AgentQuestion,
  expanded: boolean,
  onMinimise: () => void,
) {
  const rows = () => [
    ...(root.current?.querySelectorAll<HTMLElement>(ROW) ?? []),
  ];
  const focused = () =>
    document.activeElement instanceof HTMLElement &&
    root.current?.contains(document.activeElement) === true
      ? document.activeElement
      : null;
  const itemAt = () => {
    const item = focused()?.closest<HTMLElement>(ITEM);
    return item === null || item === undefined
      ? null
      : Number(item.dataset['questionItem']);
  };
  const reveal = (element: HTMLElement) => {
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest' });
  };
  const by = (step: number) => {
    const all = rows();
    const now = focused()?.closest<HTMLElement>(ROW) ?? null;
    const at = now === null ? -1 : all.indexOf(now);
    const next =
      at === -1
        ? step > 0
          ? all[0]
          : all.at(-1)
        : all[Math.min(all.length - 1, Math.max(0, at + step))];
    if (next !== undefined) reveal(next);
  };
  /** The first row of the Item at `index`; past the last, Send. */
  const toItem = (index: number) => {
    const item = root.current?.querySelector<HTMLElement>(
      `[data-question-item="${index}"]`,
    );
    if (item === null || item === undefined) {
      if (index >= question.items.length) sendButton.current?.focus();
      return;
    }
    item.scrollIntoView({ block: 'nearest' });
    const first = item.querySelector<HTMLElement>(ROW) ?? item;
    first.focus({ preventScroll: true });
  };
  const byItem = (step: number) => toItem((itemAt() ?? -1) + step);
  /** Does what a click would, or goes into a field's frame. */
  const choose = () => {
    const now = focused();
    if (now === null) return false;
    if (now.matches('[data-field]')) {
      now.querySelector<HTMLInputElement>(FIELD)?.focus();
      return false;
    }
    if (now instanceof HTMLButtonElement) {
      now.click();
      return now.matches(ROW) && !now.matches('[data-other]');
    }
    return false;
  };
  const on = { enabled: expanded };
  keys.useAction('question.next', () => by(1), on);
  keys.useAction('question.down', () => by(1), on);
  keys.useAction('question.previous', () => by(-1), on);
  keys.useAction('question.up', () => by(-1), on);
  keys.useAction('question.nextItem', () => byItem(1), on);
  keys.useAction('question.right', () => byItem(1), on);
  keys.useAction('question.previousItem', () => byItem(-1), on);
  keys.useAction('question.left', () => byItem(-1), on);
  keys.useAction('question.toggle', () => void choose(), on);
  keys.useAction(
    'question.pick',
    () => {
      const at = itemAt();
      const chose = choose();
      // One choice made, on to the next question.
      if (chose && at !== null && question.items[at]?.multiSelect === false)
        toItem(at + 1);
    },
    on,
  );
  const option = (n: number) => () => {
    const at = itemAt() ?? 0;
    root.current
      ?.querySelector<HTMLElement>(
        `[data-question-item="${at}"] [data-option="${n}"]`,
      )
      ?.click();
  };
  keys.useAction('question.option1', option(1), on);
  keys.useAction('question.option2', option(2), on);
  keys.useAction('question.option3', option(3), on);
  keys.useAction('question.option4', option(4), on);
  keys.useAction('question.option5', option(5), on);
  keys.useAction('question.option6', option(6), on);
  keys.useAction('question.option7', option(7), on);
  keys.useAction('question.option8', option(8), on);
  keys.useAction('question.option9', option(9), on);
  keys.useAction(
    'question.write',
    () => {
      const at = itemAt();
      const inItem =
        at === null
          ? null
          : root.current?.querySelector<HTMLInputElement>(
              `[data-question-item="${at}"] ${FIELD}`,
            );
      (inItem ?? root.current?.querySelector<HTMLInputElement>(FIELD))?.focus();
    },
    on,
  );
  // Escape leaves a field for its row, then minimises.
  keys.useAction(
    'question.close',
    () => {
      const now = focused();
      if (now?.matches(FIELD) === true) leaveField(now);
      else onMinimise();
    },
    on,
  );
  return { toItem };
}

/**
 * A swipe down the sheet's head, on touch: the sheet follows the finger,
 * and minimises once pulled far or fast enough, else settles back.
 */
function useSwipeDown(
  sheet: RefObject<HTMLElement | null>,
  on: boolean,
  onMinimise: () => void,
) {
  const start = useRef<{ y: number; at: number; id: number } | null>(null);
  const moved = (y: number) => {
    const element = sheet.current?.parentElement;
    if (element === null || element === undefined) return;
    element.style.transition = 'none';
    element.style.translate = `0 ${Math.max(0, y)}px`;
  };
  const settle = () => {
    const element = sheet.current?.parentElement;
    if (element === null || element === undefined) return;
    element.style.transition = '';
    element.style.translate = '';
  };
  if (!on) return {};
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if ((event.target as Element).closest('button') !== null) return;
      start.current = {
        y: event.clientY,
        at: performance.now(),
        id: event.pointerId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent) => {
      if (start.current?.id !== event.pointerId) return;
      moved(event.clientY - start.current.y);
    },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (from?.id !== event.pointerId) return;
      const pulled = event.clientY - from.y;
      const speed = pulled / Math.max(1, performance.now() - from.at);
      settle();
      if (pulled > 72 || (pulled > 16 && speed > 0.5)) onMinimise();
    },
    onPointerCancel: () => {
      start.current = null;
      settle();
    },
  };
}

/**
 * How much of the page's foot the on-screen keyboard hides, on iOS, which
 * draws it over the page; a field focused is then brought into view.
 * Android resizes the page itself, and hides nothing.
 */
function useCoveredBottom(on: boolean, root: RefObject<HTMLElement | null>) {
  const [covered, setCovered] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport ?? null;
    if (!on || viewport === null) return;
    const update = () => {
      setCovered(
        Math.max(
          0,
          Math.round(window.innerHeight - viewport.offsetTop - viewport.height),
        ),
      );
      const now = document.activeElement;
      if (now instanceof HTMLElement && root.current?.contains(now) === true)
        requestAnimationFrame(() => now.scrollIntoView({ block: 'nearest' }));
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [on]);
  return covered;
}
