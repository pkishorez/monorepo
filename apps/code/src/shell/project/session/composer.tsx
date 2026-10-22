import { Button } from '@kestack/web-platform/components/button';
import {
  CircleAlertIcon,
  WifiOffIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import type { ComponentProps, ReactNode } from 'react';
import { Composer } from '../composer/index.ts';
import { useBound } from '../../../keys.ts';

/*
 * The composer under the transcript. Enter sends, Shift+Enter is a new
 * line. Idle, the one button sends; while the agent runs it steers the
 * turn, and Stop beside it, or Mod+., cancels. A model or setting picked beside
 * them goes with the next message and those after it. `/btw` asks the session a question on
 * the side, whose answer shows above. While the server is out of reach you
 * can still write, but not send or stop, and the line above says why.
 */

interface Attached {
  readonly name: string;
  readonly mime: string;
  readonly data: string;
  readonly size: number;
}

export function SessionComposer({
  draft,
  attachments,
  known,
  skills,
  running,
  asking,
  stopping,
  problem,
  offline,
  above,
  toolbar,
  onType,
  onAttach,
  onSend,
  onStop,
}: {
  readonly draft: string;
  readonly attachments: ReadonlyArray<Attached>;
  /** The skills and commands a `/name` is drawn as a chip for. */
  readonly known: ReadonlyArray<string>;
  /** The skills Picker the page keeps. */
  readonly skills: ComponentProps<typeof Composer>['skills'];
  readonly running: boolean;
  /** The draft is a `/btw` question, so sending asks it. */
  readonly asking: boolean;
  readonly stopping: boolean;
  readonly problem: string | null;
  /** Why nothing can be sent now, or null when the server is reachable. */
  readonly offline: string | null;
  /** Floats over the composer's top edge: the answer to a `/btw`. */
  readonly above?: ReactNode;
  /** The model and settings pickers, left of the buttons. */
  readonly toolbar?: ReactNode;
  readonly onType: (text: string) => void;
  readonly onAttach: (attachments: ReadonlyArray<Attached>) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
}) {
  const blocked = offline !== null;
  const stopKeys = useBound('content.stop');
  return (
    <div className="flex flex-col gap-2">
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
      <div className="relative">
        {above}
        <Composer
          label={running ? 'Steer the agent' : 'Message'}
          placeholder={
            running
              ? 'Steer the agent while it works, or /btw to ask on the side…'
              : 'Reply, or type / for skills…'
          }
          text={draft}
          onTextChange={onType}
          attachments={attachments}
          onAttachmentsChange={onAttach}
          onSubmit={() => {
            if (!blocked) onSend();
          }}
          known={known}
          skills={skills}
          describedBy={blocked ? 'composer-offline' : undefined}
          toolbar={toolbar}
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
                type="submit"
                size="sm"
                disabled={
                  blocked || (draft.trim() === '' && attachments.length === 0)
                }
              >
                {asking ? 'Ask' : running ? 'Steer' : 'Send'}
              </Button>
            </>
          }
        />
      </div>
    </div>
  );
}
