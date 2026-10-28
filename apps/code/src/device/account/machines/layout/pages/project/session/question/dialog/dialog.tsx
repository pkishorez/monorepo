import type { AgentQuestion } from '@kestack/connect/code';
import { useKeyboardOver } from '@kestack/web-platform/recipes/touch-layers';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { ChevronDownIcon, MessageCircleQuestionMarkIcon } from 'lucide-react';
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { keys, useBound } from '../../../../../commands.ts';
import { AgentLogo } from '../../../../../../../../../ui/labels/agent/index.ts';
import { draftOf, type Drafts, isAnswered, unanswered } from '../answer.ts';
import { type Asker, type Stop, stopTitle } from '../question.ts';
import { useStepKeys } from './keys.ts';
import { useSwipeDown } from './sheet.ts';
import { ROW, Step } from './step.tsx';

/*
 * The Question Panel expanded: a dialog of steps, one Item each, in the
 * middle of the page's content column, the transcript dimmed behind it
 * and the sidebar left as it is; on touch, a sheet from the column's
 * foot. Its head says who asks, which step of how many, as a segment each
 * that is filled once answered and goes to its step, Stop while the Turn
 * runs, and Minimise. Its foot has one way on: Next, or, on the last
 * step, Send; Back from the second on; and "Skip question", which asks
 * once more before it lets the agent carry on without an answer. Sending
 * with an Item unanswered sends nothing: its step is gone to, and it and
 * its segment say it needs an answer. A step comes in from the side it
 * was gone to, the dialog grows into place and shrinks towards the bar,
 * quickly, by transform and opacity; in Vim Mode it only fades, and its
 * steps change at once, as the app's dialogs and Surfaces do; with
 * motion reduced, all of it at once.
 *
 * It is the `question` Surface (`keys.ts`), inside the page's, so the
 * sidebar's and the Pickers' keys work from it too. Focus goes to the
 * step's chosen row, else its first, as it expands, when the user asked
 * or nothing else has focus, as a step is gone to, and back from what was
 * drawn over it or from the sidebar, to the row it left. On touch the
 * sheet's rows are a finger tall, a swipe down its head minimises it, and
 * its foot stays over the on-screen keyboard.
 */

export function Dialog({
  question,
  drafts,
  tried,
  sending,
  touch,
  asker,
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
  readonly asker: Asker;
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
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const count = question.items.length;
  const many = count > 1;
  const left = unanswered(question, drafts);
  const [step, setStep] = useState(() =>
    left[0] === undefined ? 0 : question.items.indexOf(left[0]),
  );
  /** The side the step was gone to, so it comes in from there. */
  const [from, setFrom] = useState<1 | -1>(1);
  const [editing, setEditing] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const item = question.items[step]!;
  const draft = draftOf(drafts, item);
  const last = step === count - 1;

  /** The row the keys go back to: the chosen one, else the first. */
  const toRow = () => {
    const at = stepRef.current;
    (
      at?.querySelector<HTMLElement>(`${ROW}[aria-checked="true"]`) ??
      at?.querySelector<HTMLElement>(ROW)
    )?.focus({ preventScroll: true });
  };
  const moved = useRef(false);
  const goTo = (to: number) => {
    const next = Math.min(count - 1, Math.max(0, to));
    if (next === step) return;
    moved.current = true;
    setFrom(next > step ? 1 : -1);
    setEditing(false);
    setSkipping(false);
    setStep(next);
  };
  // Gone to a step: focus to its row, unless it is elsewhere.
  useLayoutEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const now = document.activeElement;
    if (
      now === null ||
      now === document.body ||
      root.current?.contains(now) === true
    )
      toRow();
  }, [step]);
  const send = () => {
    if (left[0] !== undefined) goTo(question.items.indexOf(left[0]));
    onSend();
  };
  const primary = () => (last ? send() : goTo(step + 1));
  const skip = (on: boolean) => {
    if (!on) return setSkipping(false);
    if (skipping) onDecline();
    else setSkipping(true);
  };
  // A refusal to skip leaves it asked: ask again before the next try.
  useEffect(() => {
    if (sending === null) setSkipping(false);
  }, [sending === null]);

  // Expanded, focus goes to the row it was on, else the step's: when the
  // user asked for it, or when nothing else has it.
  const lastRow = useRef<HTMLElement | null>(null);
  const { enter } = keys.useKeyboard();
  const back = () => {
    if (lastRow.current?.isConnected === true)
      lastRow.current.focus({ preventScroll: true });
    else toRow();
  };
  useLayoutEffect(() => {
    if (!expanded || touch || !claim()) return;
    back();
    // Focus already there says nothing: the keys are told.
    enter('question');
  }, [expanded]);
  // Back from what was drawn over it, such as Actions, or from the
  // sidebar: to the row it left, so the keys go on from there.
  const { active } = keys.useSurface('question');
  useEffect(() => {
    if (!active || !expanded) return;
    const frame = requestAnimationFrame(() => {
      const now = document.activeElement;
      const within =
        now instanceof HTMLElement &&
        now !== root.current &&
        root.current?.contains(now) === true;
      if (!within) back();
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useStepKeys({
    step: stepRef,
    item,
    draft,
    on: expanded,
    skipping,
    go: (by) => goTo(step + by),
    primary,
    send,
    skip,
    minimise: onMinimise,
    onChoose: (label) => onChoose(item.id, label),
    onChooseOther: () => onChooseOther(item.id),
  });

  const sendKeys = useBound('question.send');
  const minimiseKeys = useBound('question.minimise');
  const swipe = useSwipeDown(root, touch && expanded, onMinimise);
  // Measured from the box, which stays put as the sheet slides and follows
  // a swipe; 12px free over it, as its `pt-3` leaves.
  const keyboard = useKeyboardOver(touch && expanded, box, root, 12);
  const busy = sending !== null;
  return (
    <div
      ref={box}
      data-expanded={expanded ? '' : undefined}
      inert={!expanded}
      aria-hidden={!expanded}
      className={cn(
        'pointer-events-none absolute inset-0 z-20 flex flex-col items-center data-expanded:pointer-events-auto',
        // Held near the top, so its head stays put as the steps change.
        touch
          ? 'justify-end pt-3'
          : 'justify-start p-4 pt-[max(1rem,12vh)] sm:px-8',
      )}
    >
      {/* The transcript behind, dimmed; a click on it minimises. */}
      <div
        data-slot="question-backdrop"
        aria-hidden
        onClick={onMinimise}
        className="absolute inset-0 bg-black/10 opacity-0 transition-opacity duration-150 ease-in in-data-expanded:opacity-100 in-data-expanded:duration-200 in-data-expanded:ease-out supports-backdrop-filter:backdrop-blur-xs motion-reduce:transition-none dark:bg-black/60"
      />
      <keys.Surface id="question" asChild>
        <div
          ref={root}
          role="dialog"
          aria-labelledby={`${id}-title`}
          aria-busy={busy}
          data-slot="question-popup"
          // Only a row is gone back to, never a button.
          onFocus={(event) => {
            if (event.target.matches(ROW)) lastRow.current = event.target;
          }}
          style={
            touch
              ? {
                  paddingBottom: keyboard.covered,
                  maxHeight: keyboard.room ?? undefined,
                }
              : undefined
          }
          className={cn(
            'relative flex min-h-0 w-full flex-col bg-dialog text-sm text-popover-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.08),0_16px_40px_rgb(0_0_0/0.12)] ring-1 ring-edge outline-none',
            // Hidden minimised over the Surface's own look, which an
            // Inactive Surface takes, opacity 1, as the page draws it.
            'opacity-0 transition-[opacity,scale,translate] duration-150 ease-in not-in-data-expanded:opacity-0! in-data-expanded:opacity-100 in-data-expanded:duration-200 in-data-expanded:ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
            touch
              ? 'max-h-full translate-y-full rounded-t-2xl in-data-expanded:translate-y-0'
              : 'max-h-full max-w-[36rem] translate-y-3 scale-[0.97] rounded-xl in-data-expanded:translate-y-0 in-data-expanded:scale-100',
          )}
        >
          <div
            {...swipe}
            className={cn(
              'flex shrink-0 flex-col gap-3 px-5 pt-4',
              touch && 'touch-none gap-2 px-4 pt-2 select-none',
            )}
          >
            {touch && (
              <span
                aria-hidden
                className="mx-auto h-1 w-9 rounded-full bg-muted-foreground/30"
              />
            )}
            <div className="flex min-h-7 items-center gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                {asker.harness === null ? (
                  <MessageCircleQuestionMarkIcon
                    aria-hidden
                    className="size-3.5"
                  />
                ) : (
                  <AgentLogo agent={asker.harness} className="size-4" />
                )}
              </span>
              <h2 id={`${id}-title`} className="min-w-0 truncate font-medium">
                {asker.agent} asks
              </h2>
              {many && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {step + 1} of {count}
                </span>
              )}
              <span className="flex-1" />
              {stop !== null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={stop.disabled || stop.stopping}
                  title={stopTitle(stop)}
                  onClick={stop.run}
                  className="rounded-full keyboard:h-7 pointer-coarse:h-9 pointer-coarse:px-3.5"
                >
                  {stop.stopping && <Spinner />}
                  Stop
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Minimise the question"
                title={
                  minimiseKeys === null
                    ? 'Minimise, to read the session'
                    : `Minimise, to read the session (${minimiseKeys})`
                }
                onClick={onMinimise}
                className="-mr-2 gap-1.5 px-2 text-muted-foreground keyboard:h-7 pointer-coarse:size-11 pointer-coarse:px-0"
              >
                {minimiseKeys !== null && <Keys>{minimiseKeys}</Keys>}
                <ChevronDownIcon aria-hidden />
              </Button>
            </div>
            {many && (
              <Progress
                question={question}
                drafts={drafts}
                tried={tried}
                step={step}
                touch={touch}
                onStep={goTo}
              />
            )}
          </div>
          <div
            ref={stepRef}
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-5',
              touch && 'px-4 pt-3 pb-4',
            )}
          >
            <div
              key={step}
              data-slot="question-step-content"
              className={cn(
                'animate-in duration-200 ease-out fade-in-0 motion-reduce:animate-none',
                from > 0 ? 'slide-in-from-right-3' : 'slide-in-from-left-3',
              )}
            >
              <Step
                index={step}
                item={item}
                draft={draft}
                missing={tried && !isAnswered(item, draft)}
                touch={touch}
                editing={editing}
                onEditing={setEditing}
                onChoose={(label) => onChoose(item.id, label)}
                onChooseOther={() => onChooseOther(item.id)}
                onType={(text) => onType(item.id, text)}
                onNext={primary}
                onStep={(by) => goTo(step + by)}
              />
            </div>
          </div>
          <div
            className={cn(
              'flex min-h-14 shrink-0 items-center gap-2 border-t border-border px-5 py-3',
              touch && 'min-h-16 px-4',
              // The home indicator's room, but where the keyboard covers it.
              touch &&
                !keyboard.keyboard &&
                'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
            )}
          >
            {skipping ? (
              <>
                <p role="alert" className="mr-auto min-w-0 truncate">
                  <span className="font-medium">Skip this question?</span>
                  <span className="text-muted-foreground max-sm:hidden">
                    {' '}
                    {asker.agent} goes on without it.
                  </span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size={touch ? 'lg' : 'sm'}
                  onClick={() => skip(false)}
                  className="text-muted-foreground"
                >
                  Cancel
                  <Keys>esc</Keys>
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size={touch ? 'lg' : 'sm'}
                  disabled={busy}
                  onClick={() => skip(true)}
                >
                  {sending?.declining === true && <Spinner />}
                  Skip
                  <Keys>q</Keys>
                </Button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  title="Let the agent carry on without your answer"
                  onClick={() => skip(true)}
                  className="focus-ring mr-auto -ml-1 flex min-h-11 cursor-pointer items-center rounded-md px-1 text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50 keyboard:min-h-7 motion-reduce:transition-none"
                >
                  Skip question
                </button>
                {step > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size={touch ? 'lg' : 'sm'}
                    onClick={() => goTo(step - 1)}
                  >
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  size={touch ? 'lg' : 'sm'}
                  disabled={busy}
                  title={
                    last && sendKeys !== null
                      ? `Send, from any step (${sendKeys})`
                      : undefined
                  }
                  onClick={primary}
                  className={cn('min-w-20', touch && 'min-w-28')}
                >
                  {sending?.declining === false ? (
                    <>
                      <Spinner />
                      Sending…
                    </>
                  ) : (
                    <>
                      {last ? (many ? 'Send answers' : 'Send answer') : 'Next'}
                      <Keys>↵</Keys>
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </keys.Surface>
    </div>
  );
}

/** A key named on a button, with a keyboard only. */
function Keys({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="hidden font-sans text-[11px] font-normal opacity-70 keyboard:inline">
      {children}
    </kbd>
  );
}

/**
 * Which step of how many: a segment each, filled once answered, the one
 * shown half lit until it is, one left unanswered after a send in red;
 * each goes to its step.
 */
function Progress({
  question,
  drafts,
  tried,
  step,
  touch,
  onStep,
}: {
  readonly question: AgentQuestion;
  readonly drafts: Drafts | undefined;
  readonly tried: boolean;
  readonly step: number;
  readonly touch: boolean;
  readonly onStep: (to: number) => void;
}) {
  return (
    <nav aria-label="Questions" className="-my-1.5 flex gap-1">
      {question.items.map((item, at) => {
        const done = isAnswered(item, draftOf(drafts, item));
        const name = item.header || `Question ${at + 1}`;
        return (
          <button
            key={item.id}
            type="button"
            tabIndex={-1}
            aria-current={at === step ? 'step' : undefined}
            aria-label={`${name}${done ? ', answered' : ''}`}
            title={name}
            data-done={done ? '' : undefined}
            data-missing={tried && !done ? '' : undefined}
            onClick={() => onStep(at)}
            className={cn(
              'group/segment flex flex-1 cursor-pointer py-1.5',
              touch && 'py-2.5',
            )}
          >
            <span
              className={cn(
                'h-1 w-full rounded-full bg-foreground/10 transition-colors duration-150 group-hover/segment:bg-foreground/20 motion-reduce:transition-none',
                'group-aria-[current=step]/segment:bg-foreground/30',
                'group-data-done/segment:bg-primary',
                'group-data-missing/segment:bg-destructive/70',
              )}
            />
          </button>
        );
      })}
    </nav>
  );
}
