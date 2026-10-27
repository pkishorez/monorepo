import { CheckIcon } from '@kestack/web-platform/ui/components/lucide';

/*
 * A plan or a to-do list: each step's mark, then its words. Done is filled
 * and quiet, the step under way ringed and in full, the rest open. Claude
 * and Codex name a step under way differently; both read the same.
 */

export type Step = { readonly text: string; readonly status: string };

const doing = (status: string) =>
  status === 'in_progress' || status === 'inProgress';

export function Checklist({ steps }: { readonly steps: ReadonlyArray<Step> }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {steps.map((step, at) => {
        const done = step.status === 'completed';
        const now = doing(step.status);
        return (
          <li key={at} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={`mt-[5px] grid size-3.5 shrink-0 place-items-center rounded-full border ${done ? 'border-transparent bg-foreground/70 text-background' : now ? 'border-foreground' : 'border-muted-foreground/50'}`}
            >
              {done ? (
                <CheckIcon className="size-2.5" strokeWidth={3} />
              ) : now ? (
                <span className="size-1.5 rounded-full bg-foreground" />
              ) : null}
            </span>
            <span
              className={
                done ? 'text-muted-foreground' : now ? 'font-medium' : ''
              }
            >
              {step.text}
              <span className="sr-only">
                {done ? ' (done)' : now ? ' (under way)' : ' (to do)'}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** How many of the steps are done, as "2 of 5". */
export const progressOf = (steps: ReadonlyArray<Step>) =>
  `${steps.filter((step) => step.status === 'completed').length} of ${steps.length}`;
