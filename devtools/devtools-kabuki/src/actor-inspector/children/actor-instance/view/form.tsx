import { useState } from 'react';
import { ChevronRightIcon, SendIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { draftOf, messageOf } from '../logic/shared/index.ts';
import type { Action, Draft, Outcome, Problem } from '../logic/shared/index.ts';
import { Fields } from './fields.tsx';

const SAID: Record<Outcome['said'], string> = {
  handled: 'Handled',
  ignored: 'Ignored: no rule took it',
  queued: 'Queued behind the one being handled',
  refused: 'Refused',
  failed: 'Not sent',
};

const bareOf = (action: Action) =>
  action.input.kind === 'group' && action.input.fields.length === 0;

export function Form({
  action,
  sending,
  blocked,
  outcome,
  onSend,
  onEdit,
}: {
  readonly action: Action;
  readonly sending: boolean;
  readonly blocked: boolean;
  readonly outcome: Outcome | undefined;
  readonly onSend: (message: unknown) => void;
  readonly onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(action.input));
  const [problems, setProblems] = useState<ReadonlyArray<Problem>>([]);
  const bare = bareOf(action);
  const submit = () => {
    const built = messageOf(action.tag, action.input, draft);
    if (built._tag === 'Unbuilt') return setProblems(built.problems);
    setProblems([]);
    onSend(built.value);
  };
  const whole = problems.find((one) => one.path === '');
  return (
    <div className="rounded-lg transition-colors duration-150 has-[[aria-expanded=true]]:bg-muted/40">
      <div className="flex min-h-9 items-center gap-2 pr-1.5">
        <button
          type="button"
          aria-expanded={bare ? undefined : open}
          disabled={bare && (blocked || sending)}
          onClick={() => (bare ? submit() : setOpen((was) => !was))}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 touch:min-h-11"
        >
          {bare ? (
            <SendIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          ) : (
            <ChevronRightIcon
              aria-hidden
              className={cn(
                'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
                open && 'rotate-90',
              )}
            />
          )}
          <span className="font-medium">{action.tag}</span>
          {action.within === 'state' && (
            <span className="text-[10px] text-muted-foreground">state</span>
          )}
          {action.description && (
            <span className="truncate text-muted-foreground">
              {action.description}
            </span>
          )}
        </button>
        {outcome && (
          <span
            role="status"
            className={cn(
              'max-w-56 shrink-0 truncate text-xs',
              outcome.said === 'handled' || outcome.said === 'queued'
                ? 'text-added'
                : outcome.said === 'ignored'
                  ? 'text-muted-foreground'
                  : 'text-removed',
            )}
            title={outcome.reason}
          >
            {SAID[outcome.said]}
            {outcome.reason ? `: ${outcome.reason}` : ''}
          </span>
        )}
      </div>
      {open && !bare && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2 px-2.5 pt-1 pb-3 pl-8"
        >
          <Fields
            input={action.input}
            draft={draft}
            problems={problems}
            onDraft={(next) => {
              setDraft(next);
              onEdit();
            }}
          />
          {whole && <p className="text-[11px] text-removed">{whole.problem}</p>}
          <div>
            <Button
              type="submit"
              size="sm"
              disabled={sending || blocked}
              className="h-7 gap-1.5 px-3 text-xs"
            >
              <SendIcon aria-hidden className="size-3" />
              Send {action.tag}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
