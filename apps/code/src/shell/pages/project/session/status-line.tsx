import { Button } from '@kestack/web-platform/components/button';
import {
  CircleAlertIcon,
  WifiOffIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import type { ComponentProps, ReactNode } from 'react';
import { Draft, StatusLine } from '../draft/index.ts';
import { useBound } from '../../../../keys.ts';

/*
 * The session's foot: its Draft, and in the Status Line under it the model and settings
 * that go with the next message and those after it, and the send button.
 * Idle, it sends the Draft; while the agent runs it steers the turn, and
 * Stop beside it, or Mod+., cancels. `/btw` asks the session a question
 * on the side, whose answer floats above. While the server is out of
 * reach you can still write, but not send or stop, and the line above
 * says why.
 */

export function SessionStatusLine({
  draft,
  running,
  asking,
  stopping,
  problem,
  offline,
  above,
  children,
  onStop,
}: {
  readonly draft: ComponentProps<typeof Draft>['draft'];
  readonly running: boolean;
  /** The Draft is a `/btw` question, so sending asks it. */
  readonly asking: boolean;
  readonly stopping: boolean;
  readonly problem: string | null;
  /** Why nothing can be sent now, or null when the server is reachable. */
  readonly offline: string | null;
  /** Floats over its top edge: the answer to a `/btw`. */
  readonly above?: ReactNode;
  /** The model and settings pickers. */
  readonly children?: ReactNode;
  readonly onStop: () => void;
}) {
  const blocked = offline !== null;
  const stopKeys = useBound('content.stop');
  const sendKeys = useBound('content.send');
  const label = asking ? 'Ask' : running ? 'Steer' : 'Send';
  return (
    <div className="relative flex flex-col gap-2">
      {above}
      {blocked ? (
        <p
          id="draft-offline"
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
      <Draft draft={draft}>
        <StatusLine
          draft={draft}
          actions={
            <>
              {running && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={stopping || blocked}
                  title={
                    stopKeys === null
                      ? 'Stop the turn'
                      : `Stop the turn (${stopKeys})`
                  }
                  onClick={onStop}
                >
                  {stopping && <Spinner />}
                  Stop
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={blocked || !draft.filled}
                title={sendKeys === null ? label : `${label} (${sendKeys})`}
                onClick={draft.send}
              >
                {label}
              </Button>
            </>
          }
        >
          {children}
        </StatusLine>
      </Draft>
    </div>
  );
}
