// A key the whole window listens for, added and taken away with the Stage.
// eslint-disable-next-line no-restricted-imports
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { History as Kept } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { KabukiInspector } from '@kestack/devtools-kabuki/inspector';

/*
 * A demo staged to be watched: the app on top, its tree of Actors under it,
 * kept whole in view as it changes, and a thin line of its History at the
 * bottom. Nothing to click but the app; the keys move through time.
 *
 * 1. Frame     a phone-shaped column inside the safe area, clear of a
 *              player's controls at the top and the bottom.
 * 2. Keys      ← a Step back, → a Step on, F forks from the Step shown,
 *              L goes back to the latest, the Head.
 * 3. History   a tick per Step, the one shown standing taller, and where
 *              it stands in words.
 */
export function Stage({
  runtime,
  past,
  children,
}: {
  /** The running app: `App.useRuntime()`, of any Actor. */
  readonly runtime: AppRuntime;
  /** A past Step is shown: the app cannot be pressed. */
  readonly past: boolean;
  /** The app itself. */
  readonly children: ReactNode;
}) {
  const { seeking } = runtime;
  const branch = lineOf(runtime);
  const at =
    seeking === null
      ? branch.length
      : seeking.entry === null
        ? 0
        : branch.findIndex((entry) => entry.id === seeking.entry) + 1;

  // 2. Keys
  useEffect(() => {
    const showAt = (index: number) =>
      index >= branch.length
        ? runtime.toHead()
        : runtime.seek(index <= 0 ? null : branch[index - 1]!.id);
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowLeft') showAt(at - 1);
      else if (event.key === 'ArrowRight') showAt(at + 1);
      else if (event.key === 'l') runtime.toHead();
      else if (event.key === 'f' && seeking !== null)
        runtime.fork(seeking.entry);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runtime, branch, seeking, at]);

  // 1. Frame
  return (
    <div
      className="flex h-dvh w-full flex-col items-center bg-background"
      style={{
        padding:
          'max(env(safe-area-inset-top), 0px) max(env(safe-area-inset-right), 24px) max(env(safe-area-inset-bottom), 112px) max(env(safe-area-inset-left), 24px)',
      }}
    >
      <div className="flex h-full w-full max-w-[680px] flex-col gap-3 pt-[110px]">
        <div
          className={`@container relative min-h-0 flex-[1.15] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.25)] ${past ? 'pointer-events-none' : ''}`}
          inert={past}
        >
          {children}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border">
          <KabukiInspector runtime={runtime} presenting />
        </div>
        <History runtime={runtime} at={at} />
      </div>
    </div>
  );
}

/** The entries from the start to the Head; none before the app is drawn. */
const lineOf = (app: AppRuntime) =>
  app.runtime === null ? [] : Kept.entries(app.history);

// 3. History
const SHOWN = 36;

function History({
  runtime,
  at,
}: {
  readonly runtime: AppRuntime;
  readonly at: number;
}) {
  const atHead = runtime.seeking === null;
  const branch = lineOf(runtime);
  const total = branch.length;
  const first = Math.max(0, total + 1 - SHOWN);
  const ticks = Array.from({ length: total + 1 - first }, (_, i) => first + i);
  return (
    <div className="flex h-9 shrink-0 items-center gap-4 px-1">
      <div className="flex min-w-0 flex-1 items-end gap-[5px]">
        {ticks.map((index) => (
          <span
            key={index}
            className="w-[3px] rounded-full transition-[height,background-color] duration-200 ease-out"
            style={{
              height: index === at ? 18 : 10,
              backgroundColor:
                index === at
                  ? 'var(--color-foreground)'
                  : index < at
                    ? 'color-mix(in oklab, var(--color-foreground) 45%, transparent)'
                    : 'color-mix(in oklab, var(--color-foreground) 15%, transparent)',
            }}
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs font-medium tabular-nums">
        <span
          className="size-2 rounded-full"
          style={{
            backgroundColor: atHead
              ? 'oklch(0.72 0.17 150)'
              : 'color-mix(in oklab, var(--color-foreground) 30%, transparent)',
          }}
        />
        {atHead ? (
          'Running'
        ) : (
          <span className="text-muted-foreground">
            Step {at} of {total}
          </span>
        )}
      </div>
    </div>
  );
}
