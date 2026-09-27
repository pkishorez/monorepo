import { useEffect, useRef, useState } from 'react';
import type { Inspection } from '../engine';
import type { Environment } from '../environment';
import type { GestureEvent } from '../recognizers';
import type { EdgeStrips, Rect } from '../zone';
import { summarizeGesture } from './describe';
import { paint, type Palette } from './paint';
import { Panel, type LogEntry } from './panel';
import { createTrails } from './trails';

/** What the overlay reads from a Gesture Zone. */
export type OverlaySource = {
  /** Called after every input and tick; with the event when one was recognized. */
  readonly subscribe: (
    listener: (event: GestureEvent | undefined) => void,
  ) => () => void;
  readonly inspect: () => Inspection | undefined;
  readonly measure: () =>
    | { readonly rect: Rect; readonly strips: EdgeStrips }
    | undefined;
};

const LOG_LENGTH = 24;

const readPalette = (element: HTMLElement): Palette => {
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    zone: read('--gz-zone'),
    edge: read('--gz-edge'),
    pointer: read('--gz-pointer'),
    text: read('--gz-text'),
  };
};

const EMPTY: Inspection = {
  pointers: [],
  states: [],
  claimed: undefined,
  ignoring: false,
};

/**
 * Paints the zone, its edge strips and every pointer on a canvas, one
 * animation frame at a time and only while something changes. Recognizer
 * states re-render only when one changes; the live gesture line is written
 * straight to the DOM, so a drag never re-renders React.
 */
export function DebugOverlay(props: {
  readonly source: OverlaySource;
  readonly environment: Environment;
}) {
  const { source } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const [inspection, setInspection] = useState<Inspection>(
    () => source.inspect() ?? EMPTY,
  );
  const [strips, setStrips] = useState<EdgeStrips>();
  const [log, setLog] = useState<ReadonlyArray<LogEntry>>([]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (root === null || canvas === null) return;
    const trails = createTrails();
    let frame = 0;
    let stateKey = '';
    let logId = 0;

    const draw = () => {
      frame = 0;
      const now = performance.now();
      const current = source.inspect() ?? EMPTY;
      trails.record(current.pointers, now);
      const key = `${current.states.map((s) => s.state).join()}|${current.claimed}|${current.ignoring}`;
      if (key !== stateKey) {
        stateKey = key;
        setInspection(current);
      }
      const zone = source.measure();
      setStrips((previous) =>
        previous?.left.owner === zone?.strips.left.owner &&
        previous?.left.width === zone?.strips.left.width
          ? previous
          : zone?.strips,
      );
      paint(canvas, {
        zone,
        trails: trails.visible(now),
        palette: readPalette(root),
      });
      if (trails.animating()) request();
    };
    const request = () => {
      if (frame === 0) frame = requestAnimationFrame(draw);
    };

    const stop = source.subscribe((event) => {
      if (event !== undefined) {
        if (liveRef.current !== null) {
          liveRef.current.textContent = summarizeGesture(event);
        }
        if (event.phase === 'ended' || event.phase === 'cancelled') {
          const entry = { id: ++logId, event };
          setLog((previous) => [entry, ...previous].slice(0, LOG_LENGTH));
        }
      }
      request();
    });
    // The zone moves under a native scroll without any gesture input.
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    request();
    return () => {
      stop();
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      cancelAnimationFrame(frame);
    };
  }, [source]);

  return (
    <div
      ref={rootRef}
      data-testid="gesture-overlay"
      className="pointer-events-none fixed inset-0 z-50 [--gz-edge:var(--color-chart-7)] [--gz-pointer:var(--color-chart-9)] [--gz-text:var(--color-foreground)] [--gz-zone:var(--color-chart-8)]"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 size-full"
      />
      <Panel
        environment={props.environment}
        strips={strips}
        states={inspection.states}
        claimed={inspection.claimed}
        ignoring={inspection.ignoring}
        log={log}
        liveRef={liveRef}
      />
    </div>
  );
}
