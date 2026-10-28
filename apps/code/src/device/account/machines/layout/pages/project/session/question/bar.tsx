import type { AgentQuestion } from '@kestack/connect/code';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  ChevronUpIcon,
  MessageCircleQuestionMarkIcon,
  SquareIcon,
} from 'lucide-react';
import { AgentLogo } from '../../../../../../../../ui/labels/agent/index.ts';
import { type Asker, type Stop, stopTitle } from './question.ts';

/*
 * The Question Panel minimised: one bar where the Draft sits, drawn as
 * the transcript's cards are, so the transcript above it can be read,
 * scrolled and opened as ever. It says who asks, by its logo, and what:
 * the question's header, else the question, or, of several, how many are
 * answered; then Stop while the Turn runs, as the Draft's Stop is drawn,
 * Skip, and Open, the one way on, naming its keys with a keyboard. A tap
 * or click on its words opens it too. On touch it is a finger tall, in
 * the Touch Draft's place; on a phone's width Stop is its icon alone.
 */

export function Bar({
  question,
  answered,
  asker,
  sending,
  stop,
  touch,
  openKeys,
  onOpen,
  onDecline,
}: {
  readonly question: AgentQuestion;
  /** How many of its Items have an answer so far. */
  readonly answered: number;
  readonly asker: Asker;
  readonly sending: { readonly declining: boolean } | null;
  readonly stop: Stop | null;
  readonly touch: boolean;
  /** The keys that open it where the user is, or null. */
  readonly openKeys: string | null;
  readonly onOpen: () => void;
  readonly onDecline: () => void;
}) {
  const many = question.items.length > 1;
  const first = question.items[0];
  const said = many ? (
    <>
      {answered} of {question.items.length}
      {/* On a phone's width the count alone, so it is never cut. */}
      <span className="max-sm:hidden"> answered</span>
    </>
  ) : (
    first?.header || first?.question || ''
  );
  return (
    <div
      data-slot="question-bar"
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border bg-background py-1.5 pr-1.5 pl-3 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.04)]',
        touch && 'min-h-14 py-2',
      )}
    >
      {/* The words open it too; Open is the one the keys reach. */}
      <button
        type="button"
        tabIndex={-1}
        onClick={onOpen}
        className="focus-ring flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-left pointer-coarse:min-h-11"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {asker.harness === null ? (
            <MessageCircleQuestionMarkIcon aria-hidden className="size-3.5" />
          ) : (
            <AgentLogo agent={asker.harness} className="size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{asker.agent} asks</span>
          {said !== '' && (
            <span className="text-muted-foreground tabular-nums">
              {' '}
              · {said}
            </span>
          )}
        </span>
      </button>
      {stop !== null && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={stop.disabled || stop.stopping}
          aria-label="Stop the turn"
          title={stopTitle(stop)}
          onClick={stop.run}
          className="rounded-full keyboard:h-7 max-sm:w-9 max-sm:px-0 pointer-coarse:h-11 pointer-coarse:px-4 max-sm:pointer-coarse:w-11 max-sm:pointer-coarse:px-0"
        >
          {stop.stopping ? (
            <Spinner />
          ) : (
            <SquareIcon aria-hidden className="fill-current sm:hidden" />
          )}
          <span className="max-sm:hidden">Stop</span>
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={sending !== null}
        title="Let the agent carry on without your answer"
        onClick={onDecline}
        className="text-muted-foreground keyboard:h-7 pointer-coarse:h-11 pointer-coarse:px-3"
      >
        {sending?.declining === true && <Spinner />}
        Skip
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={sending !== null}
        title={
          openKeys === null
            ? 'Open the question'
            : `Open the question (${openKeys})`
        }
        onClick={onOpen}
        className="gap-1.5 keyboard:h-7 pointer-coarse:h-11 pointer-coarse:px-4"
      >
        {sending?.declining === false ? (
          <>
            <Spinner />
            Sending…
          </>
        ) : (
          <>
            <ChevronUpIcon aria-hidden />
            Open
            {openKeys !== null && (
              <kbd className="hidden font-sans text-[11px] font-normal opacity-70 keyboard:inline">
                {openKeys}
              </kbd>
            )}
          </>
        )}
      </Button>
    </div>
  );
}
