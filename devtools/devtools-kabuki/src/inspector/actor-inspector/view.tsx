import { View } from '@kestack/kabuki/react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { CanvasView } from './actor-canvas/index.ts';
import { TimelineView } from './actor-timeline/index.ts';
import { TrailView } from './actor-trail/index.ts';
import { InspectorLive } from './actor.ts';

/*
 * The Inspector drawn: the app Running, the canvas with the Timeline under
 * it or over it, or its Blueprint, one switch above them; filling whatever
 * holds it. Zoomed in on one Instance, its Trail in place of the canvas.
 * Presenting, only the canvas. Until the Kabuki Session first answers,
 * that it waits for the app; once it stops, why.
 */

const VIEWS = [
  { view: 'running', label: 'Running' },
  { view: 'blueprint', label: 'Blueprint' },
] as const;

export const InspectorView = View.make(
  InspectorLive,
  ({ model, children, send }) => (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {children.canvas ? (
        <>
          {!model.look.presenting && (
            <div
              role="tablist"
              aria-label="What the Inspector shows"
              className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 px-3"
            >
              {VIEWS.map(({ view, label }) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={model.view === view}
                  onClick={() => send({ _tag: 'Viewed', view })}
                  className={cn(
                    'relative flex h-10 items-center px-2 text-sm transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity',
                    model.view === view
                      ? 'font-medium text-foreground after:opacity-100'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {children.trail[0] ? (
              <TrailView
                key={children.trail[0].address}
                instance={children.trail[0]}
              />
            ) : (
              <CanvasView instance={children.canvas} />
            )}
          </div>
          {children.timeline && <TimelineView instance={children.timeline} />}
        </>
      ) : model.problem ? (
        <p className="p-6 text-sm text-muted-foreground">{model.problem}</p>
      ) : (
        <p
          role="status"
          className="m-auto flex items-center gap-2 text-sm text-muted-foreground"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 motion-reduce:animate-none" />
          Waiting for the app to answer…
        </p>
      )}
    </div>
  ),
);
