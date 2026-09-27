import { lazy, Suspense, useRef, useState } from 'react';
import { edgeStrips, type Environment } from '../../../environment';
import type { ZoneSource } from '../../provider';
import { CanvasLayer } from '../canvas';
import { createDebugPainter } from './paint';

// The visualizer and its layout engine load only when the overlay is shown.
const MachinePanel = lazy(() =>
  import('./machine-panel').then((module) => ({
    default: module.MachinePanel,
  })),
);

// Inside the zone's bottom-left corner, clear of the edge.
const INSET_PX = 6;

/**
 * Every zone and the edge strips labelled with who owns them, native
 * scrollers shaded, each finger's pointer id, the Environment in one line in
 * the outermost zone's corner, and the live gestures machine of the zone
 * touched last, placed by `machineClassName`. Repaints only when something
 * changes.
 */
export function DebugOverlay(props: {
  readonly source: ZoneSource;
  readonly environment: Environment;
  readonly machineClassName?: string;
}) {
  const lineRef = useRef<HTMLParagraphElement>(null);
  const [paint] = useState(() =>
    createDebugPainter(props.source, (zone) => {
      const line = lineRef.current;
      if (line === null) return;
      line.hidden = zone === undefined;
      if (zone === undefined) return;
      const bottom = Math.min(zone.bottom, window.innerHeight);
      line.style.transform = `translate(${zone.left + INSET_PX}px, ${bottom - INSET_PX - line.offsetHeight}px)`;
    }),
  );
  const { environment } = props;
  const strips = edgeStrips(environment);
  return (
    <CanvasLayer
      source={props.source}
      paint={paint}
      testId="gesture-overlay"
      className="z-50 [--gz-edge:var(--color-chart-7)] [--gz-native:var(--color-chart-6)] [--gz-pointer:var(--color-chart-9)] [--gz-text:var(--color-foreground)] [--gz-zone:var(--color-chart-8)]"
    >
      <p
        ref={lineRef}
        data-testid="gesture-overlay-environment"
        className="absolute top-0 left-0 rounded-sm bg-background/80 px-1.5 py-0.5 font-mono text-[10px] leading-tight text-muted-foreground"
      >
        {environment.platform} · {environment.display}
        {environment.reducedMotion ? ' · reduced motion' : ''} · edges{' '}
        {strips.left.owner} {strips.left.width}px
      </p>
      <Suspense>
        <MachinePanel
          source={props.source}
          className={props.machineClassName ?? 'inset-x-2 top-2 h-40'}
        />
      </Suspense>
    </CanvasLayer>
  );
}
