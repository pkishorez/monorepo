import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { getFitViewport } from '../lib/metrics';
import type {
  StateMachineSvgViewerProps,
  StateMachineViewport,
} from '../types';
import { StateMachineSvg } from './state-machine-svg';

const WHEEL_ZOOM_STEP = 1.12;
const BUTTON_ZOOM_STEP = 1.22;

interface Bounds {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

function getScale(bounds: Bounds, viewport: StateMachineViewport) {
  return Math.min(
    bounds.width / viewport.width,
    bounds.height / viewport.height,
  );
}

function toWorldPoint(
  bounds: Bounds,
  viewport: StateMachineViewport,
  clientX: number,
  clientY: number,
) {
  const scale = getScale(bounds, viewport);
  const offsetX = (bounds.width - viewport.width * scale) / 2;
  const offsetY = (bounds.height - viewport.height * scale) / 2;

  return {
    x: viewport.x + (clientX - bounds.left - offsetX) / scale,
    y: viewport.y + (clientY - bounds.top - offsetY) / scale,
  };
}

function constrainViewport(
  next: StateMachineViewport,
  fit: StateMachineViewport,
  visibleRatio: number,
): StateMachineViewport {
  return {
    ...next,
    x: Math.min(
      fit.x + fit.width - next.width * visibleRatio,
      Math.max(fit.x - next.width * (1 - visibleRatio), next.x),
    ),
    y: Math.min(
      fit.y + fit.height - next.height * visibleRatio,
      Math.max(fit.y - next.height * (1 - visibleRatio), next.y),
    ),
  };
}

export function StateMachineSvgViewer({
  layout,
  className,
  classNames,
  ariaLabel = 'State machine',
  title = 'State machine',
  showHeader = true,
  interaction,
}: StateMachineSvgViewerProps) {
  const fitViewport = useMemo(() => getFitViewport(layout), [layout]);
  const [override, setOverride] = useState<StateMachineViewport>();
  const viewport = override ?? fitViewport;
  const surface = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef(viewport);
  const drag = useRef<
    | {
        readonly clientX: number;
        readonly clientY: number;
        readonly viewport: StateMachineViewport;
        readonly scale: number;
      }
    | undefined
  >(undefined);
  const pointer = useRef<{ readonly x: number; readonly y: number }>({
    x: 0,
    y: 0,
  });
  const frame = useRef<number | undefined>(undefined);
  const pan = interaction?.pan ?? false;
  const zoom = interaction?.zoom ?? false;
  const bounded = interaction?.bounded ?? true;
  const minimumVisibleRatio = Math.min(
    1,
    Math.max(0, interaction?.minimumVisibleRatio ?? 0.5),
  );
  const minimumZoom = Math.max(0.01, interaction?.minimumZoom ?? 0.25);
  const maximumZoom = Math.max(minimumZoom, interaction?.maximumZoom ?? 4);

  viewportRef.current = viewport;

  const commit = useCallback(
    (next: (current: StateMachineViewport) => StateMachineViewport) => {
      setOverride((current) => {
        const value = next(current ?? fitViewport);
        return bounded
          ? constrainViewport(value, fitViewport, minimumVisibleRatio)
          : value;
      });
    },
    [bounded, fitViewport, minimumVisibleRatio],
  );

  const changeZoom = useCallback(
    (factor: number, focusX?: number, focusY?: number) => {
      if (!zoom) return;

      commit((current) => {
        const nextWidth = Math.min(
          fitViewport.width / minimumZoom,
          Math.max(fitViewport.width / maximumZoom, current.width * factor),
        );
        const appliedFactor = nextWidth / current.width;
        const x = focusX ?? current.x + current.width / 2;
        const y = focusY ?? current.y + current.height / 2;

        return {
          x: x - (x - current.x) * appliedFactor,
          y: y - (y - current.y) * appliedFactor,
          width: nextWidth,
          height: current.height * appliedFactor,
        };
      });
    },
    [commit, fitViewport.width, maximumZoom, minimumZoom, zoom],
  );

  useEffect(() => {
    const element = surface.current;
    if (!element || !zoom) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const bounds = element!.getBoundingClientRect();
      const focus = toWorldPoint(
        bounds,
        viewportRef.current,
        event.clientX,
        event.clientY,
      );
      changeZoom(
        event.deltaY > 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP,
        focus.x,
        focus.y,
      );
    }

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [changeZoom, zoom]);

  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!pan) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const current = viewportRef.current;
      drag.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        viewport: current,
        scale: getScale(event.currentTarget.getBoundingClientRect(), current),
      };
    },
    [pan],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!drag.current) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      if (frame.current !== undefined) return;

      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        const active = drag.current;
        if (!active) return;

        commit(() => ({
          ...active.viewport,
          x:
            active.viewport.x -
            (pointer.current.x - active.clientX) / active.scale,
          y:
            active.viewport.y -
            (pointer.current.y - active.clientY) / active.scale,
        }));
      });
    },
    [commit],
  );

  const handlePointerUp = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    drag.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const svgProps = useMemo(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      style: {
        minWidth: pan ? undefined : fitViewport.width,
        touchAction: pan ? 'none' : 'auto',
      },
    }),
    [
      fitViewport.width,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      pan,
    ],
  );

  const stats = useMemo(
    () => ({
      states: layout.nodes.filter((node) => node.kind === 'state').length,
      transitions: layout.edges.filter((edge) => !edge.initial).length,
      hasCompound: layout.nodes.some((node) => node.type === 'compound'),
      hasParallel: layout.nodes.some((node) => node.type === 'parallel'),
    }),
    [layout.edges, layout.nodes],
  );

  return (
    <section
      className={cn(
        'flex h-full min-h-80 min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-border bg-background',
        className,
      )}
      aria-label={ariaLabel}
    >
      {showHeader && (
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {stats.states} states · {stats.transitions} transitions
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LegendMark className="rounded-full bg-primary" label="Initial" />
            <LegendMark
              className="rounded-full border-[3px] border-double border-foreground/60"
              label="Final"
            />
            {stats.hasCompound && (
              <LegendMark
                className="rounded-sm border border-border bg-muted"
                label="Compound"
              />
            )}
            {stats.hasParallel && (
              <LegendMark
                className="rounded-sm border border-dashed border-muted-foreground/70 bg-muted"
                label="Parallel"
              />
            )}
            <Badge
              variant="outline"
              className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Read only
            </Badge>
          </div>
        </header>
      )}
      <div
        ref={surface}
        className={cn(
          'relative min-h-0 min-w-0 flex-1',
          pan ? 'overflow-hidden' : 'overflow-auto',
          !pan && scrollbarStyles,
        )}
        style={{
          backgroundImage:
            'radial-gradient(var(--border) 0.75px, transparent 0.75px)',
          backgroundSize: '18px 18px',
        }}
      >
        <StateMachineSvg
          layout={layout}
          classNames={classNames}
          ariaLabel={ariaLabel}
          viewport={viewport}
          className={cn(pan && 'cursor-grab active:cursor-grabbing')}
          svgProps={svgProps}
        />
        {(pan || zoom) && (
          <div className="absolute bottom-3 left-3 flex overflow-hidden rounded-md border border-border bg-background shadow-sm">
            {zoom && (
              <>
                <ControlButton
                  label="Zoom in"
                  onClick={() => changeZoom(1 / BUTTON_ZOOM_STEP)}
                >
                  +
                </ControlButton>
                <ControlButton
                  label="Zoom out"
                  onClick={() => changeZoom(BUTTON_ZOOM_STEP)}
                >
                  −
                </ControlButton>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="rounded-none px-2.5 text-[10px] text-muted-foreground"
              onClick={() => setOverride(undefined)}
            >
              Fit
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="rounded-none border-r border-border"
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </Button>
  );
}

function LegendMark({
  className,
  label,
}: {
  readonly className: string;
  readonly label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
      <span className={cn('h-2.5 w-2.5', className)} />
      {label}
    </span>
  );
}
