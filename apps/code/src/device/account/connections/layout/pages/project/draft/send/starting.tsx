import type { StartStepName } from '@kestack/connect/code';
import { CheckIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { Starting as Shown } from '../actor.ts';

/*
 * Starting: a new session's steps, from its send until Connect has made
 * the Session, drawn where its transcript will be, in place of the new
 * session's words. Each step as Connect tells it, running or done, in the
 * order they came, the one expected first running from the send on, until
 * Connect tells its own; it stays, every step done, until the Session's
 * page is drawn in its place.
 */

/** What a step says, for the branch it is started on. */
const said = (step: StartStepName, branch: string | null) => {
  switch (step) {
    case 'switchingBranch':
      return branch === null
        ? 'Switching the branch'
        : `Switching to ${branch}`;
    case 'makingWorktree':
      return branch === null
        ? 'Making a new worktree'
        : `Making a new worktree from ${branch}`;
    case 'startingAgent':
      return 'Starting the agent';
  }
};

/** A new session's steps as it starts. */
export function Starting({
  starting,
}: {
  readonly starting: typeof Shown.Type;
}) {
  const { steps, args } = starting;
  return (
    <div role="status" aria-label="Starting the session">
      <h2 className="text-lg font-semibold">Starting session</h2>
      <ol className="mt-2 flex flex-col gap-1.5 text-sm">
        {steps.map(({ step, state }) => (
          <li
            key={step}
            data-state={state}
            className="flex items-center gap-2 text-muted-foreground data-[state=done]:text-foreground"
          >
            {state === 'done' ? (
              <CheckIcon aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <Spinner className="size-3.5 shrink-0" />
            )}
            <span>
              {said(step, args.branch)}
              <span className="sr-only">
                {state === 'done' ? ', done' : ', running'}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
