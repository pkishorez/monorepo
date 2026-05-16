import React, { useState, useMemo, useRef } from 'react';
import type { TracerSpanSubscriptionRef, GlobalConfig } from '../../types.js';
import type { LayoutSpan } from '../../core/layout.js';
import { calculateHoveredSpanMap } from '../../core/layout.js';
import { timelineContext, createTimelineInstance } from './context.js';

export interface TimelineProps {
  tracerRef: TracerSpanSubscriptionRef;
  forceOptions?: Partial<GlobalConfig>;
  children?: React.ReactNode;
}

/**
 * Main Timeline component - can be used as wrapper with children OR with legacy props.
 *
 * Composable usage:
 * ```tsx
 * <Timeline tracerRef={tracerRef}>
 *   <div className="flex justify-between mb-4">
 *     <h2>My Trace</h2>
 *     <Timeline.Config variant="minimal" />
 *   </div>
 *   <Timeline.Content />
 * </Timeline>
 * ```
 *
 * Legacy usage (backward compatible):
 * ```tsx
 * <Timeline
 *   tracerRef={tracerRef}
 *   title="My Trace"
 *   configOptions={{ variant: "minimal" }}
 * />
 * ```
 */
export function Timeline({ tracerRef, forceOptions, children }: TimelineProps) {
  // Create unique timeline instance ID (stable across re-renders)
  const timelineInstanceId = useMemo(() => createTimelineInstance(), []);

  // Create refs for container and grid elements
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Span state management (per timeline instance)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [hoveredSpanMap, setHoveredSpanMap] = useState<Map<
    string,
    'parent' | 'active' | 'child'
  > | null>(null);

  const setHoveredSpan = (
    hover: { spanId: string; spanMap: Map<string, LayoutSpan> } | null,
  ) => {
    if (!hover) {
      setHoveredSpanMap(null);
      return;
    }
    const { spanId, spanMap } = hover;
    const newHoveredSpanMap = calculateHoveredSpanMap(spanMap, spanId);
    setHoveredSpanMap(newHoveredSpanMap);
  };

  // Create unique span ID function
  const getUniqueSpanId = (originalSpanId: string) =>
    `${timelineInstanceId}-${originalSpanId}`;

  return (
    <timelineContext.Provider
      value={{
        selectedSpanId,
        hoveredSpanMap,
        setSelectedSpanId,
        setHoveredSpan,
        getUniqueSpanId,

        // Store refs and tracerRef in context for child components
        containerRef,
        gridRef,
        tracerRef,

        // Add forceConfigOptions if provided
        forceConfigOptions: forceOptions ?? {},
      }}
    >
      {children}
    </timelineContext.Provider>
  );
}
