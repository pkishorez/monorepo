import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { CircleAlertIcon } from '@kestack/web-platform/ui/components/lucide';
import { Progress } from '@kestack/web-platform/ui/components/progress';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import { useBound } from '../../../../../keys.ts';
import { ago } from '../../../../../ui/time/index.ts';
import { outOfReach, useHealth } from '../../../../connection/index.ts';
import { SpeechToTextLive } from './actor.ts';

/*
 * One Machine's Speech to Text switch, as the Machine says it stands, live:
 * off; downloading, with how much of the model is in and a bar; ready; or
 * failed, saying why, with a retry. Switched off, the model is deleted.
 * Until the Machine first says, a quiet skeleton while it answers, and,
 * while it does not, a line that says so.
 */

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

export const SpeechToTextView = View.make(
  SpeechToTextLive,
  ({ root, model, send }) => {
    const health = useHealth(model.machineId);
    const dictateKeys = useBound('app.dictateAnywhere');
    const { state } = model;
    const id = `speech-${model.machineId}`;
    const on = state !== null && state._tag !== 'Off';
    return (
      <section
        {...root}
        aria-labelledby={`${id}-name`}
        className="flex flex-col gap-3"
      >
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label
              id={`${id}-name`}
              htmlFor={id}
              className="text-sm font-semibold"
            >
              Speech to Text
            </label>
            <p className="text-sm text-muted-foreground">
              Dictations are written out on this Machine. Turning it on
              downloads a model of about 460 MB; turning it off deletes it.
            </p>
          </div>
          {state !== null && (
            <Switch
              id={id}
              checked={on}
              disabled={model.switching}
              onCheckedChange={(checked) =>
                send({ _tag: 'Switch', on: checked })
              }
              className="mt-0.5"
            />
          )}
        </div>
        {state === null ? (
          outOfReach(health) ? (
            <p role="status" className="text-sm text-muted-foreground">
              Not answering, last seen {ago(health.lastSeen)}. Its Speech to
              Text shows here once it is back.
            </p>
          ) : (
            <Skeleton aria-busy className="h-4 w-40" />
          )
        ) : state._tag === 'Downloading' ? (
          <div role="status" className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground tabular-nums">
              Downloading the model
              {state.total === null
                ? `, ${megabytes(state.done)} so far`
                : `, ${megabytes(state.done)} of ${megabytes(state.total)}`}
            </p>
            <Progress
              aria-label="Downloading the model"
              value={
                state.total === null || state.total === 0
                  ? null
                  : Math.min(100, (state.done / state.total) * 100)
              }
            />
          </div>
        ) : state._tag === 'Ready' ? (
          <p role="status" className="text-xs text-muted-foreground">
            Ready
            {dictateKeys === null
              ? '.'
              : `: ${dictateKeys} starts a Dictation from anywhere in the app.`}
          </p>
        ) : state._tag === 'Failed' ? (
          <p
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive"
          >
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="min-w-0 break-words">
              Couldn't set it up: {state.reason}
            </span>
            <Button
              variant="link"
              size="xs"
              type="button"
              disabled={model.switching}
              onClick={() => send({ _tag: 'Switch', on: true })}
            >
              Try again
            </Button>
          </p>
        ) : null}
        {model.problem !== null && (
          <p
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive"
          >
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            {model.problem}
          </p>
        )}
      </section>
    );
  },
);
