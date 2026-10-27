import {
  CheckIcon,
  SquareIcon,
  XIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { ToolState } from '../rows/index.ts';

/** A call left running in a session that is not was stopped. */
export const stateOf = (state: ToolState, running: boolean): ToolState =>
  state === 'running' && !running ? 'stopped' : state;

/** Where a call stands, at the end of its line: turning, quietly done, failed, or stopped. */
export function StateMark({ state }: { readonly state: ToolState }) {
  switch (state) {
    case 'running':
      return (
        <Spinner
          aria-label="Running"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      );
    case 'done':
      return (
        <CheckIcon
          aria-label="Done"
          className="size-3.5 shrink-0 text-muted-foreground/50"
        />
      );
    case 'failed':
      return (
        <XIcon
          aria-label="Failed"
          className="size-3.5 shrink-0 text-destructive"
        />
      );
    case 'stopped':
      return (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <SquareIcon aria-hidden className="size-2.5 fill-current" />
          Stopped
        </span>
      );
  }
}
