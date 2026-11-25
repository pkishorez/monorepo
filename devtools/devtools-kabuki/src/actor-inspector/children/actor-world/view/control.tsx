import { useState } from 'react';
import {
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  PlayIcon,
} from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { draftOf, valueOf } from '../../../logic/shared/index.ts';
import type { Draft, Problem } from '../../../logic/shared/index.ts';
import { Fields } from '../../../view/shared/index.ts';
import type { Control, Outcome } from '../logic/shared/index.ts';

const ROW =
  'flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md py-1 pr-1 pl-1 text-left';

const RUN = 'h-7 gap-1.5 rounded-full px-3 text-xs';

function Said({ outcome }: { readonly outcome: Outcome }) {
  return (
    <p
      role="status"
      className={cn(
        'flex min-w-0 items-start gap-1.5 text-[11px] leading-5',
        outcome.said === 'running' && 'text-muted-foreground',
        outcome.said === 'done' && 'text-running',
        outcome.said === 'refused' && 'text-destructive',
      )}
    >
      {outcome.said === 'running' ? (
        <LoaderCircleIcon
          aria-hidden
          className="mt-[3px] size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
        />
      ) : outcome.said === 'done' ? (
        <CircleCheckIcon aria-hidden className="mt-[3px] size-3.5 shrink-0" />
      ) : (
        <CircleAlertIcon aria-hidden className="mt-[3px] size-3.5 shrink-0" />
      )}
      <span className="min-w-0 text-pretty">
        {outcome.said === 'running'
          ? 'Running…'
          : outcome.said === 'done'
            ? 'Done'
            : `Refused: ${outcome.reason ?? 'no reason given'}`}
      </span>
    </p>
  );
}

function Mark({ outcome }: { readonly outcome: Outcome }) {
  if (outcome.said === 'running')
    return (
      <LoaderCircleIcon
        aria-label="Running"
        className="ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
      />
    );
  return (
    <span
      className={cn(
        'ml-auto flex shrink-0 items-center gap-1 text-[11px]',
        outcome.said === 'done' ? 'text-running' : 'text-destructive',
      )}
    >
      {outcome.said === 'done' ? (
        <CircleCheckIcon aria-hidden className="size-3" />
      ) : (
        <CircleAlertIcon aria-hidden className="size-3" />
      )}
      {outcome.said === 'done' ? 'done' : 'refused'}
    </span>
  );
}

function Bare({
  control,
  onRun,
}: {
  readonly control: Control;
  readonly onRun: (payload: unknown) => void;
}) {
  const { outcome } = control;
  return (
    <li className="flex flex-col">
      <div className={ROW}>
        <span aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate font-mono text-xs">
          {control.name}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Run ${control.name}`}
          disabled={outcome?.said === 'running'}
          onClick={() => onRun({})}
          className={cn(RUN, 'ml-auto')}
        >
          <PlayIcon aria-hidden className="size-3" />
          Run
        </Button>
      </div>
      {outcome && (
        <div className="pb-1.5 pl-6">
          <Said outcome={outcome} />
        </div>
      )}
    </li>
  );
}

function Form({
  control,
  onRun,
}: {
  readonly control: Control;
  readonly onRun: (payload: unknown) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(control.input));
  const [problems, setProblems] = useState<ReadonlyArray<Problem>>([]);
  const { outcome } = control;
  return (
    <form
      aria-label={control.name}
      onSubmit={(event) => {
        event.preventDefault();
        const built = valueOf(control.input, draft);
        if (built._tag === 'Unbuilt') return setProblems(built.problems);
        setProblems([]);
        onRun(built.value);
      }}
      className="flex flex-col gap-2.5 pt-1 pb-3 pl-6"
    >
      <Fields
        input={control.input}
        draft={draft}
        problems={problems}
        onDraft={setDraft}
      />
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <Button
          type="submit"
          size="sm"
          disabled={outcome?.said === 'running'}
          className={RUN}
        >
          <PlayIcon aria-hidden className="size-3" />
          Run
        </Button>
        {outcome && (
          <div className="min-w-0 flex-1 basis-40 pt-1">
            <Said outcome={outcome} />
          </div>
        )}
      </div>
    </form>
  );
}

export function ControlItem({
  control,
  onRun,
}: {
  readonly control: Control;
  readonly onRun: (payload: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  if (control.bare) return <Bare control={control} onRun={onRun} />;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          ROW,
          'outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        )}
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
        <span className="min-w-0 truncate font-mono text-xs">
          {control.name}
        </span>
        {!open && control.outcome && <Mark outcome={control.outcome} />}
      </button>
      {open && <Form control={control} onRun={onRun} />}
    </li>
  );
}
