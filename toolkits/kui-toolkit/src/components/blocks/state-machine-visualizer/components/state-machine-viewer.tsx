import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Minus, Plus } from '#lib/lucide';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { getFocusHighlights, resolveFocus } from '../lib/focus';
import { getFitViewport } from '../lib/metrics';
import {
  centerViewport,
  constrainViewport,
  getDraggedViewport,
  getScale,
  interpolateCenter,
  toWorldPoint,
  type ViewportDrag,
} from '../lib/viewport';
import type {
  StateMachineFocus,
  StateMachinePoint,
  StateMachineSceneNode,
  StateMachineViewerProps,
  StateMachineViewport,
} from '../types';
import { StateMachineSvg } from './state-machine-svg';

const WHEEL_ZOOM_STEP = 1.12;
const BUTTON_ZOOM_STEP = 1.22;
const DEFAULT_MINIMUM_VISIBLE_RATIO = 0.9;
const DEFAULT_MIN_ZOOM = 0.5;
const DEFAULT_MAX_ZOOM = 3;
const DEFAULT_FOCUS: StateMachineFocus = { mode: 'click' };
const DRAG_THRESHOLD = 4;
const FOLLOW_ANIMATION_DURATION = 450;

export function StateMachineViewer({
  diagram,
  className,
  classNames,
  showHeader = true,
  focus: focusProp,
  navigation,
}: StateMachineViewerProps) {
  const focus = focusProp ?? DEFAULT_FOCUS;
  const fitViewport = useMemo(() => getFitViewport(diagram), [diagram]);
  const [override, setOverride] = useState<StateMachineViewport>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [hoveredConnectedNodeId, setHoveredConnectedNodeId] =
    useState<string>();
  const clickMode = focus.mode === 'click';
  const {
    focusedNodeIds,
    follow: followMode,
    followedCenter: targetCenter,
  } = useMemo(
    () => resolveFocus(diagram, focus, selectedNodeId),
    [diagram, focus, selectedNodeId],
  );
  const highlights = useMemo(
    () =>
      getFocusHighlights(
        diagram,
        focusedNodeIds,
        clickMode ? hoveredConnectedNodeId : undefined,
      ),
    [clickMode, diagram, focusedNodeIds, hoveredConnectedNodeId],
  );
  const animateFollow = focus.mode === 'highlight';
  const [animatedCenter, setAnimatedCenter] = useState(targetCenter);
  const animatedCenterRef = useRef(animatedCenter);
  const previousTargetCenter = useRef<StateMachinePoint | undefined>(undefined);
  const followAnimationFrame = useRef<number | undefined>(undefined);
  const followedCenter = animateFollow ? animatedCenter : targetCenter;
  const followedCenterRef = useRef(followedCenter);
  const baseViewport = override ?? fitViewport;
  const viewport = followedCenter
    ? centerViewport(baseViewport, followedCenter)
    : baseViewport;
  const surface = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef(viewport);
  const drag = useRef<ViewportDrag | undefined>(undefined);
  const pointer = useRef<StateMachinePoint>({ x: 0, y: 0 });
  const frame = useRef<number | undefined>(undefined);
  const suppressClick = useRef(false);
  const suppressClickTimer = useRef<number | undefined>(undefined);
  const pan = (navigation?.pan ?? true) && !followMode;
  const zoom = navigation?.zoom ?? true;
  const bounded = (navigation?.bounded ?? true) && !followMode;
  const minimumVisibleRatio = Math.min(
    1,
    Math.max(
      0,
      navigation?.minimumVisibleRatio ?? DEFAULT_MINIMUM_VISIBLE_RATIO,
    ),
  );
  const minZoom = Math.max(0.01, navigation?.minZoom ?? DEFAULT_MIN_ZOOM);
  const maxZoom = Math.max(minZoom, navigation?.maxZoom ?? DEFAULT_MAX_ZOOM);

  viewportRef.current = viewport;
  animatedCenterRef.current = animatedCenter;
  followedCenterRef.current = followedCenter;

  const targetX = targetCenter?.x;
  const targetY = targetCenter?.y;

  useEffect(() => {
    if (followAnimationFrame.current !== undefined) {
      cancelAnimationFrame(followAnimationFrame.current);
      followAnimationFrame.current = undefined;
    }

    if (!animateFollow || targetX === undefined || targetY === undefined) {
      previousTargetCenter.current = undefined;
      setAnimatedCenter(undefined);
      return;
    }

    const destination = { x: targetX, y: targetY };
    const start = animatedCenterRef.current;
    const previous = previousTargetCenter.current;
    previousTargetCenter.current = destination;

    if (
      start === undefined ||
      previous === undefined ||
      (previous.x === destination.x && previous.y === destination.y) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setAnimatedCenter(destination);
      return;
    }

    const origin = { x: start.x, y: start.y };
    const startedAt = performance.now();
    function step(now: number) {
      const progress = Math.min(
        1,
        (now - startedAt) / FOLLOW_ANIMATION_DURATION,
      );
      setAnimatedCenter(interpolateCenter(origin, destination, progress));
      followAnimationFrame.current =
        progress < 1 ? requestAnimationFrame(step) : undefined;
    }
    followAnimationFrame.current = requestAnimationFrame(step);

    return () => {
      if (followAnimationFrame.current !== undefined) {
        cancelAnimationFrame(followAnimationFrame.current);
        followAnimationFrame.current = undefined;
      }
    };
  }, [animateFollow, targetX, targetY]);

  useEffect(() => {
    setOverride(undefined);
    setSelectedNodeId(undefined);
  }, [diagram.id]);

  const commit = useCallback(
    (next: (current: StateMachineViewport) => StateMachineViewport) => {
      setOverride((current) => {
        const value = next(current ?? viewportRef.current);
        const constrained = bounded
          ? constrainViewport(value, fitViewport, minimumVisibleRatio)
          : value;
        const center = followedCenterRef.current;
        return center ? centerViewport(constrained, center) : constrained;
      });
    },
    [bounded, fitViewport, minimumVisibleRatio],
  );

  const changeZoom = useCallback(
    (factor: number, focusX?: number, focusY?: number) => {
      if (!zoom) return;

      commit((current) => {
        const nextWidth = Math.min(
          fitViewport.width / minZoom,
          Math.max(fitViewport.width / maxZoom, current.width * factor),
        );
        const appliedFactor = nextWidth / current.width;
        const center = followedCenterRef.current;
        const x = center?.x ?? focusX ?? current.x + current.width / 2;
        const y = center?.y ?? focusY ?? current.y + current.height / 2;

        return {
          x: x - (x - current.x) * appliedFactor,
          y: y - (y - current.y) * appliedFactor,
          width: nextWidth,
          height: current.height * appliedFactor,
        };
      });
    },
    [commit, fitViewport.width, maxZoom, minZoom, zoom],
  );

  useEffect(() => {
    const element = surface.current;
    if (!element || !zoom) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const bounds = element!.getBoundingClientRect();
      const pointerFocus = toWorldPoint(
        bounds,
        viewportRef.current,
        event.clientX,
        event.clientY,
      );
      changeZoom(
        event.deltaY > 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP,
        pointerFocus.x,
        pointerFocus.y,
      );
    }

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [changeZoom, zoom]);

  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      if (followAnimationFrame.current !== undefined) {
        cancelAnimationFrame(followAnimationFrame.current);
      }
      if (suppressClickTimer.current !== undefined) {
        window.clearTimeout(suppressClickTimer.current);
      }
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!pan) return;
      const current = viewportRef.current;
      drag.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        viewport: current,
        scale: getScale(event.currentTarget.getBoundingClientRect(), current),
        moved: false,
      };
    },
    [pan],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!drag.current) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      const active = drag.current;
      if (
        !active.moved &&
        Math.hypot(
          pointer.current.x - active.clientX,
          pointer.current.y - active.clientY,
        ) < DRAG_THRESHOLD
      ) {
        return;
      }
      if (!active.moved) {
        active.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (frame.current !== undefined) return;

      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        const currentDrag = drag.current;
        if (!currentDrag?.moved) return;

        commit(() => getDraggedViewport(currentDrag, pointer.current));
      });
    },
    [commit],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const active = drag.current;
      if (!active) return;
      drag.current = undefined;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!active.moved) return;

      if (frame.current !== undefined) {
        cancelAnimationFrame(frame.current);
        frame.current = undefined;
      }
      commit(() => getDraggedViewport(active, pointer.current));
      suppressClick.current = true;
      if (suppressClickTimer.current !== undefined) {
        window.clearTimeout(suppressClickTimer.current);
      }
      suppressClickTimer.current = window.setTimeout(() => {
        suppressClick.current = false;
        suppressClickTimer.current = undefined;
      });
    },
    [commit],
  );

  const svgProps = useMemo(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      onClick: (event: MouseEvent<SVGSVGElement>) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
      },
      style: {
        minWidth: pan || followMode ? undefined : fitViewport.width,
        touchAction: pan ? 'none' : 'auto',
        userSelect: pan ? ('none' as const) : undefined,
      },
    }),
    [
      fitViewport.width,
      followMode,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      pan,
    ],
  );

  const stats = useMemo(() => {
    let states = 0;
    let transitions = 0;
    let hasCompound = false;
    let hasParallel = false;

    for (const node of diagram.nodes) {
      if (node.kind === 'state') states += 1;
      if (node.type === 'compound') hasCompound = true;
      if (node.type === 'parallel') hasParallel = true;
    }
    for (const edge of diagram.edges) {
      if (!edge.initial) transitions += 1;
    }

    return { states, transitions, hasCompound, hasParallel };
  }, [diagram.edges, diagram.nodes]);

  const resetViewport = useCallback(() => {
    const center = followedCenterRef.current;
    setOverride(center ? centerViewport(fitViewport, center) : undefined);
  }, [fitViewport]);

  const selectNode = useCallback((node: StateMachineSceneNode) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setHoveredConnectedNodeId(undefined);
    setSelectedNodeId((current) => (current === node.id ? undefined : node.id));
  }, []);

  const clearFocus = useCallback(() => {
    setHoveredConnectedNodeId(undefined);
    setSelectedNodeId(undefined);
  }, []);

  return (
    <section
      className={cn(
        'flex h-full min-h-80 min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-border bg-background',
        className,
      )}
    >
      {showHeader && (
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {diagram.label}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {stats.states} states · {stats.transitions} transitions
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LegendMark
              className="rounded-full bg-foreground"
              label="Initial"
            />
            <LegendMark className="bg-foreground/70" label="Final" />
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
          pan || followMode ? 'overflow-hidden' : 'overflow-auto',
          !pan && !followMode && scrollbarStyles,
        )}
        style={{
          backgroundImage:
            'radial-gradient(var(--border) 0.75px, transparent 0.75px)',
          backgroundSize: '18px 18px',
        }}
      >
        <StateMachineSvg
          diagram={diagram}
          classNames={classNames}
          viewport={viewport}
          nodeHighlights={highlights.nodes}
          edgeHighlights={highlights.edges}
          onNodeSelect={clickMode ? selectNode : undefined}
          onConnectedNodeHover={
            clickMode && selectedNodeId !== undefined
              ? setHoveredConnectedNodeId
              : undefined
          }
          onClearFocus={clickMode ? clearFocus : undefined}
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
                  <Plus />
                </ControlButton>
                <ControlButton
                  label="Zoom out"
                  onClick={() => changeZoom(BUTTON_ZOOM_STEP)}
                >
                  <Minus />
                </ControlButton>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="rounded-none px-2.5 text-[10px] text-muted-foreground"
              onClick={resetViewport}
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
  readonly children: ReactNode;
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
