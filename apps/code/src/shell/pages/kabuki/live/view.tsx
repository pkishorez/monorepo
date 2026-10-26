import { useMemo } from 'react';
import { handle, type Snapshot } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { useIsMobile } from '@kestack/web-platform/ui/components/hooks/use-mobile';
import { hostHistory } from '../inspected.ts';
import { fromLive } from '../read/graph.ts';
import { learn } from '../read/learned.ts';
import { changesOf, tell, walk } from '../read/steps.ts';
import { Canvas } from '../ui/canvas.tsx';
import { Caption } from '../ui/caption.tsx';
import { Timeline, type Tick, type Tone } from '../ui/timeline.tsx';
import { LiveLive } from './actor.ts';

/*
 * Live's View: code at the Step Live holds, on the canvas, over the
 * timeline of every Step. The Step's Snapshot is played from code's
 * History as it is drawn; each card it changed is marked, and nothing
 * moves. Where the camera is, and which cards are folded, are the
 * canvas's own.
 */

const short = (id: string) => id.split('/').at(-1) ?? id;

const toneOf = (kind: string): Tone =>
  kind === 'view' ||
  kind === 'worker' ||
  kind === 'command' ||
  kind === 'restore'
    ? kind
    : 'outside';

export const LiveView = View.make(LiveLive, ({ _tag, state, model, send }) => {
  const { steps } = model;
  const history = hostHistory();
  const root = history?.actor.definition;
  const scrubbing = _tag !== 'Watching';
  const index = scrubbing
    ? steps.findIndex(({ id }) => id === state.entry)
    : steps.length - 1;
  const step = steps[index];
  // A phone keeps the canvas: two lines of the Step, the rest ringed on it.
  const lines = useIsMobile() ? 2 : 5;

  const shown = useMemo(() => {
    if (!history || !root) return undefined;
    try {
      const after: Snapshot = history.snapshotAt(step?.id ?? null);
      const before = step ? history.snapshotAt(step.parent) : undefined;
      const changes = changesOf(before, after, root);
      const entry = step
        ? history.branch().find(({ id }) => id === step.id)
        : undefined;
      // What the Step asked for: its rules played again, as they are pure.
      const commands =
        entry && before
          ? handle(root, before, entry).commands.map((command) =>
              String(
                (command as { readonly name?: unknown }).name ?? 'command',
              ),
            )
          : [];
      const took = entry
        ? {
            destination: entry.destination,
            message: entry.message._tag,
            commands,
            outcome: history.outcome(entry.id),
          }
        : undefined;
      return {
        graph: fromLive(
          walk(after, root),
          changes,
          undefined,
          learn(history, root),
          took,
        ),
        changes,
        said: entry ? tell(entry, changes, history.outcome(entry.id)) : [],
      };
    } catch {
      return undefined;
    }
  }, [history, root, step]);

  if (!shown)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        {history
          ? 'This Step is no longer kept.'
          : 'code has not run in this tab yet.'}
      </p>
    );

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Canvas
          root={shown.graph}
          opened={model.opened}
          frame={steps.length > 0}
          onOpen={(id, open) => send({ _tag: 'Toggled', id, open })}
        />
        <Caption>
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase tabular-nums">
            {step ? `${index + 1}/${steps.length}` : 'init'}
            {!scrubbing && ' · live'}
          </p>
          {step ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-sm text-pretty">
              {shown.said.slice(0, lines).map((line) => (
                <li key={line}>{line}</li>
              ))}
              {shown.said.length > lines && (
                <li className="text-muted-foreground">
                  +{shown.said.length - lines} more
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-1 text-sm">init</p>
          )}
        </Caption>
      </div>
      <Timeline
        ticks={steps.map((one): Tick => ({
          id: String(one.id),
          label: `${one.message} → ${short(one.destination)}`,
          tone: toneOf(one.source),
        }))}
        at={scrubbing ? index : null}
        onAt={(at) => {
          const chosen = at === null ? undefined : steps[at];
          send(
            chosen
              ? { _tag: 'Chose', entry: chosen.id }
              : { _tag: 'BackToLive' },
          );
        }}
        playing={_tag === 'Playing'}
        onPlaying={(play) => send({ _tag: play ? 'Play' : 'Pause' })}
        live={{ shown: !scrubbing }}
        caption={
          step ? (
            <p className="truncate">
              <span className="font-mono">{step.message}</span>
              <span className="text-muted-foreground">
                {' '}
                → {short(step.destination)}
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">—</p>
          )
        }
      />
    </>
  );
});
