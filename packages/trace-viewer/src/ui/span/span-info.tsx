import React, { useContext, useEffect, useState } from 'react';
import {
  autoUpdate,
  flip,
  useFloating,
  shift,
  size,
  offset,
} from '@floating-ui/react';
import { cn } from '@monorepo/frontend/utils';
import { AnimatePresence, motion } from '@monorepo/frontend/motion';
import { useShadowScope } from '@monorepo/frontend/lib/shadow-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@monorepo/frontend/components/ui/breadcrumb';
import { Clock, Zap, Layers } from '@monorepo/frontend/lucide';
import { Cause } from 'effect';
import type { LayoutSpan, AllLayoutResults } from '../../core/layout.js';
import { getHierarchy } from '../../core/layout.js';
import { getSpanUIKey } from './span-bar.js';
import { timelineContext } from '../timeline/context.js';
import { SPAN_INFO_LAYOUT } from '../constants.js';

// ============================================================================
// Types
// ============================================================================

export interface SpanInfoProps {
  spanMap: AllLayoutResults['spanMap'];
}

type SpanStatus = 'success' | 'error' | 'interrupted' | 'in-progress';

// ============================================================================
// useSpanInfoState Hook
// ============================================================================

function useSpanInfoState() {
  const { selectedSpanId, setSelectedSpanId, setHoveredSpan } =
    useContext(timelineContext);

  return {
    selectedSpanId,
    setSelectedSpanId,
    setHoveredSpan,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getSpanStatus(span: LayoutSpan): SpanStatus {
  const { end } = span.orig;
  if (end === null) return 'in-progress';
  if (end.exit._tag === 'Failure') {
    return Cause.isInterrupted(end.exit.cause) ? 'interrupted' : 'error';
  }
  return 'success';
}

function getSpanDuration(span: LayoutSpan): string | null {
  const { end, startTime } = span.orig;
  if (end === null) return null;
  return ((end.time - startTime) / 1000).toFixed(2);
}

// ============================================================================
// AttributeItem Component (merged)
// ============================================================================

interface AttributeItemProps {
  attrKey: string;
  value: unknown;
}

const AttributeItem = React.memo(function AttributeItem({
  attrKey,
  value,
}: AttributeItemProps) {
  const valueStr = React.useMemo(() => String(JSON.stringify(value)), [value]);
  const isLong = valueStr.length > 80;
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-md bg-muted/50 border border-border/50 p-3 space-y-1.5">
      <div className="text-xs font-semibold text-foreground/80">{attrKey}</div>
      <div className="text-xs font-mono text-foreground/90">
        {isLong && !expanded ? (
          <div className="space-y-1.5">
            <div className="line-clamp-2 break-all">{valueStr}</div>
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Show more
            </button>
          </div>
        ) : (
          <div className="break-all">{valueStr}</div>
        )}
        {isLong && expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-primary font-semibold hover:underline mt-1.5"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// BreadcrumbNav Component (merged)
// ============================================================================

interface BreadcrumbNavProps {
  hierarchy: string[];
  spanMap: Map<string, LayoutSpan>;
  onSpanSelect: (spanId: string) => void;
}

function BreadcrumbNav({
  hierarchy,
  spanMap,
  onSpanSelect,
}: BreadcrumbNavProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="text-sm gap-0.5 sm:gap-1">
        {hierarchy.map((id, index) => {
          const isLast = index === hierarchy.length - 1;
          const breadcrumbSpan = spanMap.get(id);
          const displayName = breadcrumbSpan?.orig.name ?? id;

          return (
            <React.Fragment key={id}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-semibold text-foreground">
                    {displayName}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="cursor-pointer text-foreground/50 hover:text-foreground/90 hover:underline transition-all"
                    onClick={() => onSpanSelect(id)}
                  >
                    {displayName}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator className="text-foreground/30" />
              )}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

// ============================================================================
// SpanInfoContent Component (merged)
// ============================================================================

interface SpanInfoContentProps {
  span: LayoutSpan;
  spanMap: Map<string, LayoutSpan>;
  onSpanSelect: (spanId: string) => void;
}

function SpanInfoContent({
  span,
  spanMap,
  onSpanSelect,
}: SpanInfoContentProps) {
  const { orig, events } = span;
  const { attributes, spanId } = orig;

  const hierarchy = React.useMemo(
    () => getHierarchy(spanMap, spanId),
    [spanMap, spanId],
  );

  const status = getSpanStatus(span);
  const duration = getSpanDuration(span);

  return (
    <motion.div className="space-y-4">
      {/* Header */}
      <div className="space-y-2.5 pb-4 border-b">
        <BreadcrumbNav
          hierarchy={hierarchy}
          spanMap={spanMap}
          onSpanSelect={onSpanSelect}
        />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {duration && (
              <div className="flex items-center gap-1.5 text-xs text-foreground/70">
                <Clock className="w-3.5 h-3.5" />
                <span className="font-semibold">{duration}s</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-foreground/70">
              <Layers className="w-3.5 h-3.5" />
              <span className="font-semibold">depth {span.depth}</span>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                {
                  'bg-green-500/20 text-green-800 dark:text-green-300':
                    status === 'success',
                  'bg-red-500/20 text-red-800 dark:text-red-300':
                    status === 'error',
                  'bg-yellow-600/20 text-yellow-900 dark:text-yellow-300':
                    status === 'interrupted',
                  'bg-blue-500/20 text-blue-800 dark:text-blue-300':
                    status === 'in-progress',
                },
              )}
            >
              {status === 'in-progress' && <Zap className="w-3 h-3" />}
              {status}
            </span>
          </div>
          <code className="text-[10px] text-foreground/50 font-mono">
            {spanId}
          </code>
        </div>
      </div>

      {/* Attributes */}
      {Object.keys(attributes).length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/60">
            Attributes
          </h4>
          <div className="space-y-2.5">
            {Object.entries(attributes).map(([key, value]) => (
              <AttributeItem key={key} attrKey={key} value={value} />
            ))}
          </div>
        </div>
      )}

      {/* Events */}
      {events.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/60">
            Events ({events.length})
          </h4>
          <div className="space-y-1">
            {events.map((event, idx) => {
              const logLevel = String(
                event.orig.attributes['effect.logLevel'] ?? '',
              );
              const relativeTime = (event.xRel / 1000).toFixed(3);
              const eventAttrs = Object.entries(event.orig.attributes).filter(
                ([key]) => key !== 'effect.logLevel',
              );

              return (
                <div
                  key={idx}
                  className="text-[11px] py-1 px-1.5 border-l-2 space-y-0.5"
                  style={{
                    borderLeftColor:
                      logLevel === 'ERROR'
                        ? 'rgb(239 68 68)'
                        : logLevel === 'WARN'
                          ? 'rgb(234 179 8)'
                          : 'rgb(156 163 175)',
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {event.orig.name}
                    </span>
                    <span className="text-[10px] text-foreground/40 font-mono">
                      +{relativeTime}s
                    </span>
                  </div>

                  {eventAttrs.length > 0 && (
                    <div className="space-y-0 text-[10px] text-foreground/60 font-mono">
                      {eventAttrs.map(([key, value]) => (
                        <div key={key}>
                          {key}: {String(JSON.stringify(value))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// SpanInfo Component (main)
// ============================================================================

export function SpanInfo({ spanMap }: SpanInfoProps) {
  const [, forceRender] = useState(0);
  const { selectedSpanId, setSelectedSpanId, setHoveredSpan } =
    useSpanInfoState();

  const span = spanMap.get(selectedSpanId!);
  const { getUniqueSpanId } = useContext(timelineContext);
  const _scope = useShadowScope();
  const shadowRoot = _scope.shadowRoot ?? document;
  const selectedSpanRef = selectedSpanId
    ? (shadowRoot?.getElementById(
        getSpanUIKey(getUniqueSpanId(selectedSpanId)),
      ) ?? null)
    : null;
  const isOpen = !!span;

  const { refs, isPositioned, floatingStyles } = useFloating({
    elements: {
      reference: selectedSpanRef,
    },
    open: isOpen,
    whileElementsMounted: (reference, floating, update) => {
      return autoUpdate(reference, floating, update, {});
    },
    middleware: [
      offset(SPAN_INFO_LAYOUT.PANEL_OFFSET_PX),
      flip(),
      shift({
        padding: SPAN_INFO_LAYOUT.SHIFT_PADDING_PX,
      }),
      size({
        padding: SPAN_INFO_LAYOUT.PANEL_PADDING_PX,
        apply({ availableWidth, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `${Math.min(availableWidth, SPAN_INFO_LAYOUT.PANEL_MAX_WIDTH_PX)}px`,
          });
        },
      }),
    ],
  });

  const initiallyPositioned = React.useRef(false);
  initiallyPositioned.current = initiallyPositioned.current || isPositioned;

  useEffect(() => {
    const fn = () => {
      if (selectedSpanId === null) {
        setHoveredSpan(null);
      }
      setSelectedSpanId(null);
    };
    document.addEventListener('click', fn);

    return () => document.removeEventListener('click', fn);
  }, [isOpen, selectedSpanId]);

  useEffect(() => {
    const elem = document.createElement('div');
    document.body.appendChild(elem);

    return () => {
      document.body.removeChild(elem);
    };
  }, []);

  const handleSpanSelect = (spanId: string) => {
    setSelectedSpanId(spanId);
  };

  return (
    <>
      <AnimatePresence>
        {span && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 bg-black/40 z-5"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </AnimatePresence>

      <div className="fixed inset-0 z-1000000 pointer-events-none">
        <motion.div
          className={cn('absolute top-0 left-0 z-10', {
            'pointer-events-none': !isOpen,
          })}
          onClick={(ev) => {
            ev.stopPropagation();
            console.log('STOP PROPAGATION');
          }}
          style={{
            transform: initiallyPositioned.current
              ? (floatingStyles.transform as string)
              : 'unset',
          }}
          ref={refs.setFloating}
        >
          <AnimatePresence
            onExitComplete={() => {
              initiallyPositioned.current = false;
              forceRender((x) => x + 1);
            }}
            mode="wait"
          >
            {span && (
              <motion.div
                key={span.orig.spanId}
                className={cn(
                  'w-[500px] max-w-full max-h-[70vh] overflow-auto pointer-events-auto',
                  'text-foreground rounded-lg p-6',
                  'border border-border bg-background/80 backdrop-blur-sm',
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <SpanInfoContent
                  span={span}
                  spanMap={spanMap}
                  onSpanSelect={handleSpanSelect}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
