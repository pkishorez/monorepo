import React, { useContext } from 'react';
import { MotionValue, useTransform } from '@monorepo/frontend/motion';
import { Cause } from 'effect';
import { millisToPxs, type AllLayoutResults } from '../../core/layout.js';
import { timelineContext } from '../timeline/context.js';
import { useEffectiveConfig } from '../controls/config.js';
import {
  SpanBar,
  SpanEvents,
  getSpanUIKey,
  type SpanStatus,
  type HoverStatus,
} from './span-bar.js';
import { SPAN_LAYOUT, TIMELINE_LAYOUT } from '../constants.js';

export { getSpanUIKey };

// ============================================================================
// Hook: useSpanState
// ============================================================================

function useSpanState(spanId: string) {
  const config = useEffectiveConfig();
  const { selectedSpanId, hoveredSpanMap, setSelectedSpanId, setHoveredSpan } =
    useContext(timelineContext);

  const hoverStatus: HoverStatus = hoveredSpanMap
    ? ((hoveredSpanMap.get(spanId) as HoverStatus) ?? 'disable')
    : 'no-hover';

  const isSelected = selectedSpanId === spanId;

  return {
    config,
    isSelected,
    selectedSpanId,
    hoverStatus,
    setSelectedSpanId,
    setHoveredSpan,
  };
}

// ============================================================================
// SpanUI Component
// ============================================================================

export interface SpanUIProps {
  layout: AllLayoutResults;
  span: AllLayoutResults['spans'][number];
  xTimelinePxs: MotionValue<number>;
  spanMap: AllLayoutResults['spanMap'];
}

function getSpanStatus(span: AllLayoutResults['spans'][number]): SpanStatus {
  const { end } = span.orig;
  if (end === null) return 'in-progress';
  if (end.exit._tag === 'Failure') {
    return Cause.hasInterrupts(end.exit.cause) ? 'interrupted' : 'error';
  }
  return 'success';
}

function getSpanDuration(
  span: AllLayoutResults['spans'][number],
): number | null {
  const { end, startTime } = span.orig;
  if (end === null) return null;
  return end.time - startTime;
}

export function SpanUI({ span, xTimelinePxs, spanMap }: SpanUIProps) {
  const {
    width: _width,
    start: _start,
    depth,
    layer,
    orig: { spanId },
  } = span;

  const {
    config,
    isSelected,
    selectedSpanId,
    hoverStatus,
    setSelectedSpanId,
    setHoveredSpan,
  } = useSpanState(spanId);

  const startPxs = millisToPxs(_start, config.secondInPxs);

  const getWidth = (x: number) => {
    if (_width === null) {
      const w = x ? Math.max(x - startPxs - SPAN_LAYOUT.MARGIN_PX * 2, 0) : 0;
      return w;
    }

    const w = Math.max(
      millisToPxs(_width, config.secondInPxs) - SPAN_LAYOUT.MARGIN_PX * 2,
      0,
    );
    return w;
  };

  const mWidth = useTransform(xTimelinePxs, getWidth);

  const x = startPxs + SPAN_LAYOUT.MARGIN_PX;
  const y =
    (config.layoutType === 'base' ? depth : layer) *
    TIMELINE_LAYOUT.ROW_HEIGHT_PX;

  const opacity = useTransform(xTimelinePxs, (xPxs): number => {
    if (startPxs > xPxs) return 0;
    if (hoverStatus === 'disable') return 0.5;

    if (config.layoutType !== 'base') {
      if (span.orig.end && span.orig.end.time !== span.orig.end.origTime) {
        return 0.7;
      }
      return 1;
    }
    return 0.6;
  });

  const status = getSpanStatus(span);
  const duration = getSpanDuration(span);

  const handleClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    console.log('SPAN: ', span);
    if (!config.enableSelect) return;
    ev.stopPropagation();
    (ev.target as HTMLDivElement).scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
    const newSelectedId = isSelected ? null : spanId;
    setSelectedSpanId(newSelectedId);
  };

  const handleMouseEnter = () => {
    if (!config.enableHover) return;
    if (selectedSpanId) return;
    setHoveredSpan({ spanId, spanMap });
  };

  const handleMouseLeave = () => {
    if (!config.enableHover) return;
    if (selectedSpanId) return;
    setHoveredSpan(null);
  };

  return (
    <SpanBar
      spanId={spanId}
      span={span}
      name={span.orig.name}
      x={x}
      y={y}
      width={mWidth}
      opacity={opacity}
      depth={depth}
      duration={duration}
      status={status}
      events={span.events}
      isSelected={isSelected}
      hoverStatus={hoverStatus}
      enableMeta={config.enableMeta}
      enableTooltip={config.enableTooltip}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {!isSelected && config.enableEvents && (
        <SpanEvents events={span.events} secondInPxs={config.secondInPxs} />
      )}
    </SpanBar>
  );
}
