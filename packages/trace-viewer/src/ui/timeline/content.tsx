import React, { useMemo, useRef, useState, ReactNode } from 'react';
import { TooltipProvider } from '@monorepo/frontend/components/ui/tooltip';
import {
  motion,
  MotionValue,
  useTransform,
  useAnimationFrame,
  useMotionValue,
} from '@monorepo/frontend/motion';
import { cn } from '@monorepo/frontend/utils';
import { useComponentLifecycle, useEventCallback } from 'use-effect-ts';
import { Chunk, Effect, Stream } from 'effect';
import type { TracerSpanSubscriptionRef } from '../../types.js';
import { tracerSpanSchema } from '../../core/schema.js';
import {
  computeLayout,
  millisToPxs,
  type AllLayoutResults,
  type LayoutType,
} from '../../core/layout.js';
import { SpanUI, SpanInfo } from '../span/index.js';
import { useTimelineContext } from './context.js';
import { useEffectiveConfig } from '../controls/config.js';
import { LiveBar } from './live-bar.js';
import { TIMELINE_LAYOUT, transition } from '../constants.js';

// ============================================================================
// Internal Hooks
// ============================================================================

function useSafeState<T>(defaultValue: T | (() => T)) {
  const [state, setState] = useState<T>(defaultValue);
  const lastUpdateRef = useRef<T>(state);

  return [
    state,
    (value: T) => {
      if (value !== lastUpdateRef.current) {
        lastUpdateRef.current = value;
        setState(value);
      }
    },
  ] as const;
}

function useAnimateFrame<T>(valueFn: () => T, fps: number | null = null) {
  const motionValue = useMotionValue(valueFn());

  const frame = useRef(0);
  useAnimationFrame(() => {
    if (fps !== null) {
      if (frame.current++ % (60 / fps) !== 0) return;
    }
    const old = motionValue.get();
    const newVal = valueFn();
    if (old === newVal) return;

    motionValue.set(newVal);
  });

  return motionValue;
}

function useLayout(tracerRef: TracerSpanSubscriptionRef) {
  const config = useEffectiveConfig();
  const maxGapInMillis = useMemo(
    () => (config.maxGapInPxs / config.secondInPxs) * 1000,
    [config.maxGapInPxs, config.secondInPxs],
  );
  const minSpanDurationInMillis = useMemo(
    () => (config.minSpanDurationInPxs / config.secondInPxs) * 1000,
    [config.minSpanDurationInPxs, config.secondInPxs],
  );

  const executeLayout = useEventCallback(
    (value: (typeof tracerSpanSchema.Type)[]) => {
      return computeLayout(
        {
          maxGapInMillis,
          minSpanDurationInMillis: config.isLive ? 0 : minSpanDurationInMillis,
          layoutType: config.layoutType as LayoutType,
        },
        value,
      );
    },
  );

  const [layout, setLayout] = React.useState<AllLayoutResults>(
    executeLayout([]),
  );
  const layoutRef = useRef(layout);

  useComponentLifecycle(
    Effect.gen(function* () {
      yield* tracerRef.changes.pipe(
        Stream.runForEachChunk(
          Effect.fn(function* (chunk) {
            const latest = yield* Chunk.last(chunk);
            const result = executeLayout(latest.value);
            layoutRef.current = result;
            setLayout(result);
            yield* Effect.sleep(0);
          }),
        ),
      );
    }),
    {
      deps: [
        tracerRef,
        config.layoutType,
        maxGapInMillis,
        minSpanDurationInMillis,
        config.isLive,
      ],
    },
  );

  return {
    layoutRef,
    layout,
    maxGapInMillis,
  };
}

interface UseLiveTrackingOptions {
  layout: AllLayoutResults;
  maxGapInMillis: number;
}

function useLiveTracking({ layout, maxGapInMillis }: UseLiveTrackingOptions) {
  const config = useEffectiveConfig();
  const [showLiveGap, setShowLiveGap] = useSafeState(false);
  const [hasActivity, setHasActivity] = useSafeState(false);

  const liveValue = useAnimateFrame(() => {
    const { negate, latestEndTime } = layout;
    if (layout.spans.length === 0) {
      setShowLiveGap(false);
      setHasActivity(false);
      return { xMillis: 0, gap: 0 };
    }

    const now = Date.now();
    const relNow = now + negate;
    if (latestEndTime === null) {
      setShowLiveGap(false);
      setHasActivity(true);
      return { xMillis: relNow, gap: 0 };
    }

    const gap = config.enableLiveBar ? relNow - latestEndTime : 0;
    setShowLiveGap(gap > maxGapInMillis);
    setHasActivity(false);
    return { xMillis: latestEndTime, gap };
  });

  const gapLive = useTransform(liveValue, (v) => v.gap);

  const liveGapWidth = useTransform(gapLive, (gap) =>
    Math.min(millisToPxs(gap, config.secondInPxs), config.maxGapInPxs),
  );

  const xTimelinePxs = useTransform(liveValue, ({ xMillis }) =>
    millisToPxs(xMillis, config.secondInPxs),
  );

  const timelineWidth = useTransform(
    [xTimelinePxs, liveGapWidth] as MotionValue<number>[],
    ([x, gap]: number[]) =>
      x! +
      (config.enableLiveBar
        ? (config.enableLiveGap ? gap! : 0) + TIMELINE_LAYOUT.LIVEBAR_WIDTH
        : 0),
  );

  const liveGapContent = useTransform(
    gapLive,
    (gap) => (gap / 1000).toFixed(1) + 's',
  );

  return {
    xTimelinePxs,
    liveGapWidth,
    liveGapContent,
    timelineWidth,
    showLiveGap: showLiveGap && config.enableLiveGap,
    hasActivity,
  };
}

// ============================================================================
// Gap UI Component (merged from gap-ui.tsx)
// ============================================================================

interface GapUIProps {
  width: number;
  x: number | MotionValue<number>;
  children?: React.ReactNode;
}

const GapUI = React.memo(function GapUI({ width, x, children }: GapUIProps) {
  return (
    <motion.div
      className={cn(
        'h-full flex items-center justify-center group',
        'bg-foreground/15 dark:bg-foreground/5',
      )}
      animate={{ opacity: 1 }}
      style={{
        gridRow: 1,
        gridColumn: 1,
        x,
        width,
      }}
    >
      <span
        className={cn(
          'text-ellipsis overflow-hidden text-xs px-2',
          'transition-colors duration-200',
          'text-foreground/40 group-hover:text-foreground/80',
          {
            '[writing-mode:vertical-rl]': width < 50,
          },
        )}
      >
        {children}
      </span>
    </motion.div>
  );
});

// ============================================================================
// Layout Gaps Component (merged from layout-gaps.tsx)
// ============================================================================

interface LayoutGapsProps {
  layout: AllLayoutResults;
  showLiveGap: boolean;
  liveGapContent: MotionValue<string>;
  xTimelinePxs: MotionValue<number>;
}

function LayoutGaps({
  layout,
  showLiveGap,
  liveGapContent,
  xTimelinePxs,
}: LayoutGapsProps) {
  const config = useEffectiveConfig();
  const x = useTransform(
    xTimelinePxs,
    (v) => v + TIMELINE_LAYOUT.GAP_MARGIN_PX,
  );

  return (
    <>
      {showLiveGap && (
        <GapUI
          width={config.maxGapInPxs - TIMELINE_LAYOUT.GAP_MARGIN_PX * 2}
          x={x}
        >
          <motion.span>{liveGapContent}</motion.span>
        </GapUI>
      )}
      {layout.gaps.map((gap, i) => {
        const xPos =
          millisToPxs(gap.x, config.secondInPxs) +
          TIMELINE_LAYOUT.GAP_MARGIN_PX;
        const width =
          millisToPxs(gap.netGap, config.secondInPxs) -
          TIMELINE_LAYOUT.GAP_MARGIN_PX * 2;
        const origGapWidth = millisToPxs(gap.origGap, config.secondInPxs);

        if (width <= 0 || origGapWidth <= config.maxGapInPxs) return null;

        return (
          <GapUI width={width} x={xPos} key={i}>
            {(gap.origGap / 1000).toFixed(2)}s
          </GapUI>
        );
      })}
    </>
  );
}

// ============================================================================
// Delay Component (inlined)
// ============================================================================

const Delay = ({
  children,
  delay = 1000,
}: {
  children: () => React.ReactNode;
  delay?: number;
}) => {
  const [show, setShow] = useState(false);

  React.useEffect(() => {
    const id = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(id);
  }, []);

  if (!show) return null;

  return children();
};

// ============================================================================
// Timeline Content Component
// ============================================================================

export interface TimelineContentProps {
  className?: string;
  fallback?: ReactNode;
  children?: ReactNode;
}

/**
 * Standalone TimelineContent component that renders the timeline visualization.
 * Can be used independently with context or within a TimelineWrapper.
 *
 * When used within TimelineWrapper, it automatically gets layout, theme, and refs from context.
 * When used independently, you need to provide the required context manually.
 *
 * Usage within TimelineWrapper:
 * ```tsx
 * <TimelineWrapper tracerRef={tracerRef}>
 *   <TimelineContent className="mt-4" />
 * </TimelineWrapper>
 * ```
 *
 * Usage independently (advanced):
 * ```tsx
 * <timelineContext.Provider value={customContext}>
 *   <TimelineContent />
 * </timelineContext.Provider>
 * ```
 */
export function TimelineContent({
  className,
  fallback,
  children,
}: TimelineContentProps) {
  const context = useTimelineContext();
  const { containerRef, gridRef, tracerRef } = context;
  const config = useEffectiveConfig();

  // Calculate layout using the tracerRef from context
  const { layoutRef, maxGapInMillis } = useLayout(tracerRef);
  const layout = layoutRef.current;

  const {
    xTimelinePxs,
    liveGapWidth,
    liveGapContent,
    timelineWidth,
    showLiveGap,
    hasActivity,
  } = useLiveTracking({ layout: layoutRef.current, maxGapInMillis });

  if (layout.spans.length === 0) {
    return fallback;
  }

  const gridHeight =
    (layout.spans.reduce(
      (max, span) =>
        Math.max(max, config.layoutType === 'base' ? span.depth : span.layer),
      0,
    ) +
      1) *
    TIMELINE_LAYOUT.ROW_HEIGHT_PX;

  return (
    <div ref={containerRef} className={cn(className)}>
      <TooltipProvider delay={2000}>
        <motion.div
          style={{
            width: timelineWidth,
            marginTop: TIMELINE_LAYOUT.GRID_MARGIN_TOP_PX,
          }}
          ref={gridRef}
          className={cn('grid grid-cols-1 grid-rows-1', `min-w-full`, {
            'float-right': config.isLive,
          })}
          transition={transition}
          initial={{ height: gridHeight }}
          animate={{ height: gridHeight }}
        >
          {layout.spans.map((span) => (
            <SpanUI
              layout={layout}
              xTimelinePxs={xTimelinePxs}
              span={span}
              spanMap={layout.spanMap}
              key={span.orig.spanId}
            />
          ))}
          <LayoutGaps
            layout={layout}
            liveGapContent={liveGapContent}
            showLiveGap={showLiveGap}
            xTimelinePxs={xTimelinePxs}
          />
          <LiveBar
            hasActivity={hasActivity}
            xTimelinePxs={xTimelinePxs}
            liveGapWidth={liveGapWidth}
            liveGapContent={liveGapContent}
            showLiveGap={showLiveGap}
            isLive={config.isLive}
            maxGapInPxs={config.maxGapInPxs}
          />
        </motion.div>
      </TooltipProvider>
      <div className="clear-both" />
      <Delay key={config.layoutType}>
        {() => <SpanInfo spanMap={layout.spanMap} />}
      </Delay>
      {children}
    </div>
  );
}
