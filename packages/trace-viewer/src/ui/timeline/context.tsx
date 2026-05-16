import React, { createContext, useContext } from 'react';
import type { LayoutSpan } from '../../core/layout.js';
import type { TracerSpanSubscriptionRef, GlobalConfig } from '../../types.js';

// Global counter for timeline instances
let globalTimelineCounter = 0;

export interface TimelineContextValue {
  forceConfigOptions?: Partial<GlobalConfig>;
  selectedSpanId: string | null;
  hoveredSpanMap: Map<string, 'parent' | 'active' | 'child'> | null;
  setSelectedSpanId: (spanId: string | null) => void;
  setHoveredSpan: (
    hover: { spanId: string; spanMap: Map<string, LayoutSpan> } | null,
  ) => void;
  getUniqueSpanId: (originalSpanId: string) => string;
  // Mandatory refs and tracerRef - Timeline is required
  containerRef: React.RefObject<HTMLDivElement | null>;
  gridRef: React.RefObject<HTMLDivElement | null>;
  tracerRef: TracerSpanSubscriptionRef;
}

export const timelineContext = createContext<TimelineContextValue>({
  selectedSpanId: null,
  hoveredSpanMap: null,
  setSelectedSpanId: () => {},
  setHoveredSpan: () => {},
  getUniqueSpanId: (id) => id,
  // These will throw errors if accessed outside Timeline
  containerRef: { current: null },
  gridRef: { current: null },
  get tracerRef(): never {
    throw new Error('Timeline context accessed outside of Timeline component');
  },
});

export function createTimelineInstance(): number {
  return ++globalTimelineCounter;
}

/**
 * Hook that provides safe access to the timeline context.
 * Returns the full timeline context including theme, refs, and state management.
 */
export function useTimelineContext(): TimelineContextValue {
  const context = useContext(timelineContext);

  if (!context) {
    throw new Error(
      'useTimelineContext must be used within a Timeline wrapper',
    );
  }

  return context;
}

/**
 * Hook that provides optional access to timeline context.
 * Returns the timeline context if available, or null if used outside a Timeline wrapper.
 * Useful for components that can work both inside and outside Timeline.
 */
export function useOptionalTimelineContext(): TimelineContextValue | null {
  return useContext(timelineContext);
}
