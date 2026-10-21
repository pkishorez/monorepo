import { Button } from '@kestack/web-platform/components/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@kestack/web-platform/components/input-group';
import {
  CircleAlertIcon,
  WifiOffIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';

/*
 * The composer under the transcript. Enter sends, Shift+Enter is a new
 * line. Idle, the one button sends; while the agent runs it steers the
 * turn, and Stop beside it cancels. While the server is out of reach you
 * can still write, but not send or stop, and the line above says why.
 */

export function Composer({
  draft,
  running,
  stopping,
  problem,
  offline,
  onType,
  onSend,
  onStop,
}: {
  readonly draft: string;
  readonly running: boolean;
  readonly stopping: boolean;
  readonly problem: string | null;
  /** Why nothing can be sent now, or null when the server is reachable. */
  readonly offline: string | null;
  readonly onType: (text: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
}) {
  const blocked = offline !== null;
  const send = () => {
    if (!blocked) onSend();
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      {blocked ? (
        <p
          id="composer-offline"
          className="flex items-center gap-2 px-1 text-sm text-muted-foreground"
        >
          <WifiOffIcon aria-hidden className="size-3.5 shrink-0 text-warning" />
          {offline} to the server. Sending is paused until it is back.
        </p>
      ) : (
        problem !== null && (
          <p
            role="alert"
            className="flex items-center gap-2 px-1 text-sm text-destructive"
          >
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            {problem}
          </p>
        )
      )}
      <InputGroup className="rounded-xl bg-card shadow-xs dark:bg-card">
        <InputGroupTextarea
          aria-label={running ? 'Steer the agent' : 'Message'}
          aria-describedby={blocked ? 'composer-offline' : undefined}
          placeholder={running ? 'Steer the agent while it works…' : 'Reply…'}
          rows={1}
          value={draft}
          className="max-h-60 min-h-11 px-3.5 pt-3 text-base leading-relaxed"
          onChange={(event) => onType(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
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
              disabled={stopping || blocked}
              onClick={onStop}
            >
              {stopping && <Spinner />}
              Stop
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={blocked || draft.trim() === ''}
          >
            {running ? 'Steer' : 'Send'}
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
