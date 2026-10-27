import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Progress } from '@kestack/web-platform/ui/components/progress';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { ReactNode } from 'react';
import { useBound } from '../../../../../commands.ts';
import { ago } from '../../../../../../../../../ui/labels/status/index.ts';
import { outOfReach } from '../../../../../../machine/connection/index.ts';
import { useLock } from '../../../../../../machine/connection/index.ts';
import { SpeechToTextLive } from './actor.ts';

/*
 * One Machine's Speech to Text switch, in one calm layout whose size never
 * changes: its name and the switch, then one line, and a thin bar kept
 * under it that fills only while the model downloads. The line says what
 * it does while off; downloading, how much is in; ready, how to dictate;
 * failed or refused, why, with a retry. Switched off, the model is
 * deleted. While the Machine's Line is not connected, it shows as last
 * kept and the switch takes nothing. Kept nowhere, until the Machine
 * first says, the line is a quiet skeleton while it answers, and, while it
 * does not, says so.
 */

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

export const SpeechToTextView = View.make(
  SpeechToTextLive,
  ({ root, model, props, send }) => {
    const { health, locked } = useLock(model.machineId);
    const dictateKeys = useBound('app.dictateAnywhere');
    const state = props.speech;
    const id = `speech-${model.machineId}`;
    const on = state !== null && state._tag !== 'Off';
    const downloading = state?._tag === 'Downloading' ? state : null;
    const retry = (
      <Button
        variant="link"
        size="xs"
        type="button"
        className="h-auto shrink-0 p-0"
        disabled={model.switching || locked}
        onClick={() => send({ _tag: 'Switch', on: true })}
      >
        Try again
      </Button>
    );
    const said = (text: string, after?: ReactNode, role = 'status') => (
      <p
        role={role}
        className={cn(
          'flex min-w-0 items-center gap-2',
          role === 'alert' && 'text-destructive',
        )}
      >
        <span className="truncate" title={text}>
          {text}
        </span>
        {after}
      </p>
    );
    const line =
      model.problem !== null ? (
        said(model.problem, undefined, 'alert')
      ) : state === null ? (
        outOfReach(health) ? (
          said(`Not answering, last seen ${ago(health.lastSeen)}`)
        ) : (
          <Skeleton aria-busy className="h-3 w-40" />
        )
      ) : state._tag === 'Off' ? (
        said('Dictate by voice, with a 460 MB model on this Machine')
      ) : state._tag === 'Downloading' ? (
        said(
          state.total === null
            ? `Downloading the model, ${megabytes(state.done)} so far`
            : `Downloading the model, ${megabytes(state.done)} of ${megabytes(state.total)}`,
        )
      ) : state._tag === 'Ready' ? (
        said(
          dictateKeys === null
            ? 'Ready to dictate'
            : `Ready · ${dictateKeys} dictates anywhere`,
        )
      ) : (
        said(`Couldn't set it up: ${state.reason}`, retry, 'alert')
      );
    return (
      <section
        {...root}
        aria-labelledby={`${id}-name`}
        className="flex flex-col gap-1"
      >
        <div className="flex min-h-11 items-center gap-3 keyboard:min-h-8">
          <label
            id={`${id}-name`}
            htmlFor={id}
            className="flex-1 text-sm font-medium"
          >
            Speech to Text
          </label>
          {/* A finger's 44px to tap with no keyboard; with one, the switch alone. */}
          <label
            htmlFor={id}
            className="-my-3 -mr-3 grid size-11 shrink-0 place-items-center keyboard:contents"
          >
            <Switch
              id={id}
              checked={on}
              disabled={state === null || model.switching || locked}
              onCheckedChange={(checked) =>
                send({ _tag: 'Switch', on: checked })
              }
            />
          </label>
        </div>
        <div className="flex h-4 items-center text-xs text-muted-foreground tabular-nums">
          {line}
        </div>
        {/* Kept whether or not it downloads, so nothing moves when it starts. */}
        <div className="mt-1 h-1.5">
          {downloading !== null && (
            <Progress
              aria-label="Downloading the model"
              value={
                downloading.total === null || downloading.total === 0
                  ? null
                  : Math.min(100, (downloading.done / downloading.total) * 100)
              }
            />
          )}
        </div>
      </section>
    );
  },
);
