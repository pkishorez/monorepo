import { useState } from 'react';
import { ChevronRightIcon, SendIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { draftOf, messageOf } from '../../../../../logic/shared/index.ts';
import type { Draft, Problem } from '../../../../../logic/shared/index.ts';
import { Fields } from '../../../../../view/shared/index.ts';
import type { Action, Outcome } from '../logic/shared/index.ts';

const SAID: Record<Outcome['said'], string> = {
  handled: 'Handled',
  ignored: 'Ignored: no rule took it',
  queued: 'Queued behind the one being handled',
  refused: 'Refused',
  failed: 'Not sent',
};

function Said({ outcome }: { readonly outcome: Outcome }) {
  return (
    <p
      role="status"
      className={cn(
        'text-[11px]',
        outcome.said === 'handled' || outcome.said === 'queued'
          ? 'text-running'
          : outcome.said === 'ignored'
            ? 'text-muted-foreground'
            : 'text-destructive',
      )}
    >
      {SAID[outcome.said]}
      {outcome.reason ? `: ${outcome.reason}` : ''}
    </p>
  );
}

function Form({
  action,
  sending,
  outcome,
  onSend,
}: {
  readonly action: Action;
  readonly sending: boolean;
  readonly outcome: Outcome | undefined;
  readonly onSend: (message: unknown) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(action.input));
  const [problems, setProblems] = useState<ReadonlyArray<Problem>>([]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const built = messageOf(action.tag, action.input, draft);
        if (built._tag === 'Unbuilt') return setProblems(built.problems);
        setProblems([]);
        onSend(built.value);
      }}
      className="flex flex-col gap-2 pt-1 pb-3 pl-5"
    >
      {action.description && (
        <p className="text-[11px] text-muted-foreground">
          {action.description}
        </p>
      )}
      <Fields
        input={action.input}
        draft={draft}
        problems={problems}
        onDraft={setDraft}
      />
      {problems.some((one) => one.path === '') && (
        <p className="text-[11px] text-destructive">
          {problems.find((one) => one.path === '')?.problem}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={sending}
          className="h-7 gap-1.5 rounded-full px-3 text-xs"
        >
          <SendIcon aria-hidden className="size-3" />
          Send
        </Button>
        {outcome && <Said outcome={outcome} />}
      </div>
    </form>
  );
}

export function Actions({
  actions,
  past,
  sending,
  outcome,
  onSend,
  onNow,
}: {
  readonly actions: ReadonlyArray<Action>;
  readonly past: boolean;
  readonly sending: string | null;
  readonly outcome: Outcome | null;
  readonly onSend: (tag: string, message: unknown) => void;
  readonly onNow: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (actions.length === 0) return null;
  return (
    <section
      data-space-ignore
      aria-label="Actions"
      className="mt-1 flex cursor-auto flex-col gap-0.5 border-t border-border pt-2 pb-1 select-text"
    >
      <h4 className="px-1 pb-0.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        Actions
      </h4>
      {past ? (
        <div className="flex items-center gap-2 px-1 pb-2">
          <p className="text-[11px] text-muted-foreground">
            The app shows a past Step.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNow}
            className="ml-auto h-7 rounded-full text-xs"
          >
            Go back to now
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {actions.map((action) => {
            const shown = open === action.tag;
            return (
              <li key={action.tag}>
                <button
                  type="button"
                  aria-expanded={shown}
                  onClick={() => setOpen(shown ? null : action.tag)}
                  className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-1 text-left outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <ChevronRightIcon
                    aria-hidden
                    className={cn(
                      'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
                      shown && 'rotate-90',
                    )}
                  />
                  <span className="min-w-0 truncate font-mono text-xs">
                    {action.tag}
                  </span>
                  {outcome?.tag === action.tag && !shown && (
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {outcome.said}
                    </span>
                  )}
                </button>
                {shown && (
                  <Form
                    action={action}
                    sending={sending === action.tag}
                    outcome={outcome?.tag === action.tag ? outcome : undefined}
                    onSend={(message) => onSend(action.tag, message)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
