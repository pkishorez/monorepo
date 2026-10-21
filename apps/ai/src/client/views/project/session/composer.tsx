import { Button } from '@kestack/web-platform/components/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@kestack/web-platform/components/input-group';
import { CircleAlertIcon } from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';

/*
 * The composer under the transcript. Enter sends, Shift+Enter is a new
 * line. Idle, the one button sends; while the agent runs it steers the
 * turn, and Stop beside it cancels.
 */

export function Composer({
  draft,
  running,
  stopping,
  problem,
  onType,
  onSend,
  onStop,
}: {
  readonly draft: string;
  readonly running: boolean;
  readonly stopping: boolean;
  readonly problem: string | null;
  readonly onType: (text: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
}) {
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      {problem !== null && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-sm text-destructive"
        >
          <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
          {problem}
        </p>
      )}
      <InputGroup className="rounded-xl bg-card shadow-xs dark:bg-card">
        <InputGroupTextarea
          aria-label={running ? 'Steer the agent' : 'Message'}
          placeholder={running ? 'Steer the agent while it works…' : 'Reply…'}
          rows={1}
          value={draft}
          className="max-h-60 min-h-11 px-3.5 pt-3 text-[15px] leading-relaxed"
          onChange={(event) => onType(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <InputGroupAddon
          align="block-end"
          className="cursor-default justify-end gap-1.5 px-2 pb-2"
        >
          {running && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={stopping}
              onClick={onStop}
            >
              {stopping && <Spinner />}
              Stop
            </Button>
          )}
          <Button type="submit" size="sm" disabled={draft.trim() === ''}>
            {running ? 'Steer' : 'Send'}
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
