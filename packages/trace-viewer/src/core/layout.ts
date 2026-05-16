import { Exit } from 'effect';
import { TimeInMillis, tracerSpanSchema } from './schema.js';

// ============================================================================
// Types
// ============================================================================

export interface LayoutConfig {
  maxGapInMillis: number;
  minSpanDurationInMillis?: number;
}

export type LayoutSpan = {
  orig: Omit<typeof tracerSpanSchema.Type, 'events' | 'end'> & {
    end: null | {
      exit: Exit.Exit<any>;
      time: typeof TimeInMillis.Type;
      origTime: typeof TimeInMillis.Type;
    };
  };

  start: typeof TimeInMillis.Type;
  width: typeof TimeInMillis.Type | null;
  depth: number;
  layer: number;

  events: Array<{
    orig: (typeof tracerSpanSchema.Type)['events'][number];
    xRel: typeof TimeInMillis.Type;
  }>;
};

type LayoutResult = {
  negate: number;
  maxGapInMillis: number;
  latestEndTime: typeof TimeInMillis.Type | null;
  spans: LayoutSpan[];
  spanMap: Map<string, LayoutSpan>;
  gaps: {
    x: typeof TimeInMillis.Type;
    netGap: typeof TimeInMillis.Type;
    origGap: typeof TimeInMillis.Type;
  }[];
};

export type BaseLayoutResult = LayoutResult & {
  type: 'base';
};

export type CompactLayoutResult = LayoutResult & {
  type: 'compact';
};

export type AllLayoutResults = BaseLayoutResult | CompactLayoutResult;

// ============================================================================
// Utilities
// ============================================================================

function invariant(condition: unknown, message: string): asserts condition {
  if (condition) {
    return;
  }
  throw new Error(`Invariant failure: ${message}`);
}

export function millisToPxs(
  timeInMillis: number,
  secondInPixels: number,
): number {
  return (timeInMillis / 1000) * secondInPixels;
}

export function pxsToMillis(pxs: number, secondInPixels: number): number {
  return (pxs / secondInPixels) * 1000;
}

/**
 * Get the hierarchy of span IDs from root to the given span ID.
 *
 * @param spanMap - Map of span IDs to LayoutSpan objects
 * @param spanId - The target span ID to get the hierarchy for
 * @returns Array of span IDs from root to the given span
 *
 * @example
 * If span A is the parent of span B, and span B is the parent of span C.
 * getHierarchy(spanMap, "C") returns ["A", "B", "C"]
 */
export function getHierarchy(
  spanMap: Map<string, LayoutSpan>,
  spanId: string,
): string[] {
  const hierarchy: string[] = [];
  let currentId: string | null = spanId;

  while (currentId !== null) {
    hierarchy.push(currentId);
    const span = spanMap.get(currentId);
    if (!span) break;

    const parentSpanId = span.orig.parentSpanId;
    invariant(
      currentId !== parentSpanId,
      `Circular reference detected: span ${currentId} has itself as parent`,
    );

    currentId = parentSpanId;
  }

  return hierarchy.reverse();
}

/**
 * Calculate the span hierarchy map for a hovered span.
 * Returns a map of span IDs to their relationship with the hovered span.
 *
 * @param spanMap - Map of span IDs to LayoutSpan objects
 * @param spanId - The ID of the hovered span
 * @returns Map of span IDs to their relationship type ("parent" | "active" | "child")
 *
 * @example
 * If hovering on span B with parent A and child C:
 * calculateHoveredSpanMap(spanMap, "B") returns Map { "A" => "parent", "B" => "active", "C" => "child" }
 */
export function calculateHoveredSpanMap(
  spanMap: Map<string, LayoutSpan>,
  spanId: string,
): Map<string, 'parent' | 'active' | 'child'> {
  const hoveredSpanMap = new Map<string, 'parent' | 'active' | 'child'>();

  // Mark the active span
  hoveredSpanMap.set(spanId, 'active');

  // Find and mark all parent spans
  const currentSpan = spanMap.get(spanId);
  if (currentSpan) {
    let parentId = currentSpan.orig.parentSpanId;
    while (parentId) {
      hoveredSpanMap.set(parentId, 'parent');
      const parentSpan = spanMap.get(parentId);
      if (!parentSpan) break;
      parentId = parentSpan.orig.parentSpanId;
    }
  }

  // Find and mark all child spans (recursively)
  const findChildren = (currentId: string) => {
    for (const [id, span] of spanMap.entries()) {
      if (span.orig.parentSpanId === currentId && !hoveredSpanMap.has(id)) {
        hoveredSpanMap.set(id, 'child');
        findChildren(id); // Recursively find descendants
      }
    }
  };
  findChildren(spanId);

  return hoveredSpanMap;
}

// ============================================================================
// Base Layout
// ============================================================================

const baseLayout = (
  { maxGapInMillis, minSpanDurationInMillis = 0 }: LayoutConfig,
  spans: (typeof tracerSpanSchema.Type)[],
): BaseLayoutResult => {
  const sortedSpans: (Omit<typeof tracerSpanSchema.Type, 'end'> & {
    end: LayoutSpan['orig']['end'];
  })[] = spans
    .slice()
    .map((span) => {
      if (span.end === null) return { ...span, end: null };
      const duration = span.end.time - span.startTime;
      return {
        ...span,
        end: span.end
          ? {
              ...span.end,
              time: TimeInMillis.make(
                duration < minSpanDurationInMillis
                  ? span.startTime + minSpanDurationInMillis
                  : span.end.time,
              ),
              origTime: span.end.time,
            }
          : null,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);
  if (sortedSpans.length === 0) {
    return {
      type: 'base',
      maxGapInMillis,
      negate: 0,
      latestEndTime: null,
      gaps: [],
      spanMap: new Map(),
      spans: [],
    };
  }

  const initialTime = sortedSpans[0]!.startTime;
  let lastEndTime: typeof TimeInMillis.Type | null = initialTime;
  const spanUis: Map<string, LayoutSpan> = new Map();
  const timeMillisGaps: {
    startTime: typeof TimeInMillis.Type;
    origGap: typeof TimeInMillis.Type;
    netGap: typeof TimeInMillis.Type;
  }[] = [];

  const totalNegate = () =>
    timeMillisGaps.reduce(
      (acc, gap) => TimeInMillis.make(acc - gap.origGap + gap.netGap),
      TimeInMillis.make(0),
    );

  for (const span of sortedSpans) {
    const gapInMillis = TimeInMillis.make(
      lastEndTime ? span.startTime - lastEndTime : 0,
    );
    if (lastEndTime && gapInMillis > 0) {
      const origGap = gapInMillis;
      const netGap =
        origGap > maxGapInMillis ? TimeInMillis.make(maxGapInMillis) : origGap;
      timeMillisGaps.push({
        startTime: TimeInMillis.make(lastEndTime + totalNegate() - initialTime),
        origGap: gapInMillis,
        netGap,
      });
    }

    const parent =
      (span.parentSpanId ? spanUis.get(span.parentSpanId) : null) ?? null;
    if (span.parentSpanId)
      invariant(
        parent,
        `parent span with id ${span.parentSpanId} not found for span ${span.spanId}`,
      );

    const depth = parent ? parent.depth + 1 : 0;
    const start = TimeInMillis.make(
      span.startTime + totalNegate() - initialTime,
    );
    spanUis.set(span.spanId, {
      orig: span,

      start,
      width: span.end
        ? TimeInMillis.make(span.end.origTime - span.startTime)
        : null,
      depth,
      layer: depth,

      events: span.events.map((event) => ({
        orig: event,
        xRel: TimeInMillis.make(
          event.time + totalNegate() - initialTime - start,
        ),
      })),
    });

    lastEndTime =
      span.end && lastEndTime
        ? span.end.time > lastEndTime
          ? span.end.time
          : lastEndTime
        : null;
  }

  return {
    type: 'base',
    negate: totalNegate() - initialTime,
    latestEndTime: lastEndTime
      ? TimeInMillis.make(lastEndTime + totalNegate() - initialTime)
      : null,
    maxGapInMillis,
    spanMap: spanUis,
    spans: Array.from(spanUis.values()),
    gaps: timeMillisGaps.map(({ startTime, origGap, netGap }) => ({
      x: startTime,
      origGap,
      netGap,
    })),
  };
};

// ============================================================================
// Compact Layout
// ============================================================================

const compactLayout = (result: BaseLayoutResult): CompactLayoutResult => {
  const layerEndMap = new Map<number, number | null>();

  const compactResultMap = new Map<string, LayoutSpan>();

  for (let span of [...result.spans].sort((a, z) => a.start - z.start)) {
    const parent = compactResultMap.get(span.orig.parentSpanId!);
    let targetLayer = parent ? parent.layer + 1 : 0;

    while (true) {
      const layerEnd = layerEndMap.get(targetLayer);
      if (layerEnd === undefined) {
        layerEndMap.set(
          targetLayer,
          span.width === null ? null : span.start + span.width,
        );
        compactResultMap.set(span.orig.spanId, {
          ...span,
          layer: targetLayer,
        });
        break;
      } else if (layerEnd === null || layerEnd > span.start) {
        targetLayer++;
        continue;
      } else {
        layerEndMap.set(
          targetLayer,
          span.width === null ? null : span.start + span.width,
        );
        compactResultMap.set(span.orig.spanId, {
          ...span,
          layer: targetLayer,
        });
        break;
      }
    }
  }
  return {
    ...result,
    type: 'compact',
    spanMap: compactResultMap,
    spans: Array.from(compactResultMap.values()),
  };
};

// ============================================================================
// Compute Layout (main entry point)
// ============================================================================

export type LayoutType = 'base' | 'compact';

export function computeLayout(
  config: LayoutConfig & { layoutType: LayoutType },
  spans: (typeof tracerSpanSchema.Type)[],
): AllLayoutResults {
  const baseResult = baseLayout(config, spans);

  if (config.layoutType === 'base') {
    return baseResult;
  }

  return compactLayout(baseResult);
}
