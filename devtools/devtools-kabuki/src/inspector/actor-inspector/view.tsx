import { View } from '@kestack/kabuki/react';
import { CanvasView } from './actor-canvas/index.ts';
import { TimelineView } from './actor-timeline/index.ts';
import { InspectorLive } from './actor.ts';

/*
 * The Inspector drawn: the canvas, and the Timeline under it or over it,
 * filling whatever holds it. Until the Kabuki Session first answers, that
 * it waits for the app; once it stops, why.
 */

export const InspectorView = View.make(InspectorLive, ({ model, children }) => (
  <div className="relative flex min-h-0 flex-1 flex-col">
    {children.canvas ? (
      <>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <CanvasView instance={children.canvas} />
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
));
