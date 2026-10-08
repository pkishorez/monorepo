import { useEffect, useMemo, useRef } from 'react';
import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

import { cn } from '@kstackz/web-platform/components/utils';

import {
  anchorsOf,
  buildLaymoTree,
  curveOf,
  LaymoCard,
  laymoCardHeight,
  laymoCardWidth,
  laymoLayers,
  laymoLines,
  lookOf,
  lookSurface,
  layoutLaymo,
  rankEdgesOf,
  topPathOf,
  type LaymoTree,
} from '../laymo';
import { indexChanges } from '../project-changes';

const padding = 24;
const minWidth = 480;
const minHeight = 240;

export interface SnapshotSize {
  readonly width: number;
  readonly height: number;
}

export interface ArchitectureSnapshotProps {
  readonly analysis: ArchitectureAnalysis;
  readonly changes?: ChangeSet;
  /**
   * Draw every top-level card. Otherwise only the changed ones are drawn,
   * and everything is drawn when no analyzed Module changed.
   */
  readonly includeUnchanged?: boolean;
  /** Largest canvas, in CSS pixels; a bigger drawing is scaled down to fit. */
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  /** Shown above the drawing, usually the Project's name. */
  readonly title?: string;
  /** How the caption names the Base ref; defaults to the Change set's ref. */
  readonly baseLabel?: string;
  /**
   * Called once the drawing is on the page at its final size. The canvas
   * size is the drawing alone; the caller measures the whole element.
   */
  readonly onReady?: (canvas: SnapshotSize) => void;
  readonly className?: string;
}

/**
 * A still Laymo sized to its content: the Project card open, its children
 * ranked, and the imports and Violations between them. What a
 * screenshot of a Project's architecture should show.
 */
export function ArchitectureSnapshot({
  analysis,
  changes,
  includeUnchanged = false,
  maxWidth = 1600,
  maxHeight = 1600,
  title,
  baseLabel,
  onReady,
  className,
}: ArchitectureSnapshotProps) {
  const changeIndex = useMemo(
    () => (changes === undefined ? undefined : indexChanges(analysis, changes)),
    [analysis, changes],
  );
  const tree = useMemo(() => {
    const whole = buildLaymoTree(analysis.tree);
    if (includeUnchanged || changeIndex === undefined) return whole;
    const changed = whole.root.children.filter((card) =>
      changeIndex.modules.has(topPathOf(card)),
    );
    if (changed.length === 0) return whole;
    const root = { ...whole.root, children: changed };
    return {
      root,
      byKey: new Map([...whole.byKey, [root.key, root]]),
    } as LaymoTree;
  }, [analysis.tree, changeIndex, includeUnchanged]);
  const open = useMemo(() => new Set([tree.root.key]), [tree]);
  const map = useMemo(
    () =>
      layoutLaymo(
        tree,
        open,
        () => ({ width: laymoCardWidth, height: laymoCardHeight }),
        (node) => rankEdgesOf(node, analysis),
      ),
    [tree, open, analysis],
  );
  const drawn = useMemo(
    () => laymoLines(tree, open, analysis, undefined),
    [tree, open, analysis],
  );

  const drawing = {
    width: Math.max(minWidth, Math.ceil(map.bounds.width + padding * 2)),
    height: Math.max(minHeight, Math.ceil(map.bounds.height + padding * 2)),
  };
  const scale = Math.min(
    1,
    maxWidth / drawing.width,
    maxHeight / drawing.height,
  );
  const canvas = {
    width: Math.round(drawing.width * scale),
    height: Math.round(drawing.height * scale),
  };
  const moduleCount = analysis.tree.nodes.filter(
    ({ kind }) => kind === 'module',
  ).length;
  // Modules whose own files changed, not the ones holding them.
  const changedCount =
    changeIndex === undefined
      ? 0
      : analysis.tree.nodes.filter(
          ({ kind, ownFiles }) =>
            kind === 'module' &&
            ownFiles.some((file) => changeIndex.files.has(file)),
        ).length;

  const latest = useRef(onReady);
  latest.current = onReady;
  useEffect(() => {
    // The fonts and the paint both settle within a frame of mounting.
    const frame = requestAnimationFrame(() => latest.current?.(canvas));
    return () => cancelAnimationFrame(frame);
  }, [canvas.width, canvas.height]);

  return (
    <div
      className={cn(
        'inline-flex flex-col gap-2 bg-background p-4 text-foreground',
        className,
      )}
      style={{ width: canvas.width + 32 }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-xs">
        <span className="min-w-0 truncate font-semibold">
          {title ?? 'laymos'}
        </span>
        <span className="text-muted-foreground">
          {changes === undefined
            ? `${moduleCount} Modules`
            : `${changedCount} of ${moduleCount} Modules changed since ${shortRef(baseLabel ?? changes.baseRef)}`}
        </span>
      </div>
      <div
        className="relative shrink-0 overflow-hidden rounded-lg border border-border"
        style={{ width: canvas.width, height: canvas.height }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: drawing.width,
            height: drawing.height,
            transform: `scale(${scale})`,
            backgroundImage:
              'radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--border) 90%, transparent) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        >
          <div
            className="absolute"
            style={{
              left:
                padding -
                map.bounds.x +
                (drawing.width - padding * 2 - map.bounds.width) / 2,
              top: padding - map.bounds.y,
            }}
          >
            {map.cards.map((card) => {
              const top = card.parentKey === null;
              const status = top
                ? undefined
                : changeIndex?.modules.get(topPathOf(card.node));
              return (
                <div
                  key={card.key}
                  className={cn(
                    'absolute overflow-hidden rounded-xl bg-card text-card-foreground ring-1 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_2px_8px_-2px_rgb(0_0_0/0.06)]',
                    lookSurface({
                      look: lookOf(card.node),
                      open: card.open,
                      depth: card.depth,
                      top,
                      status,
                    }),
                  )}
                  style={{
                    left: card.x,
                    top: card.y,
                    width: card.width,
                    height: card.height,
                    zIndex: laymoLayers.card(card.depth),
                  }}
                >
                  <LaymoCard
                    card={card.node}
                    top={top}
                    open={card.open}
                    status={status}
                  />
                </div>
              );
            })}
            <svg
              aria-hidden
              width="1"
              height="1"
              className="absolute left-0 top-0 overflow-visible"
              style={{ zIndex: laymoLayers.line(false, 1) }}
            >
              <defs>
                {(['import', 'violation'] as const).map((kind) => (
                  <marker
                    key={kind}
                    id={`snapshot-arrow-${kind}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={strokes[kind]} />
                  </marker>
                ))}
              </defs>
              {drawn.edges.map((edge) => {
                const from = map.byKey.get(edge.from);
                const to = map.byKey.get(edge.to);
                if (from === undefined || to === undefined) return null;
                const { start, end, vertical } = anchorsOf(from, to);
                return (
                  <path
                    key={edge.id}
                    d={curveOf(start, end, vertical)}
                    fill="none"
                    stroke={strokes[edge.kind]}
                    strokeWidth={1.25}
                    strokeLinecap="round"
                    markerEnd={`url(#snapshot-arrow-${edge.kind})`}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>— import</span>
        <span className="text-destructive">— Violation</span>
        <span>A card sits below the siblings that import it.</span>
      </p>
    </div>
  );
}

const strokes = {
  import: 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)',
  violation: 'var(--destructive)',
} as const;

// A full commit hash reads better abbreviated; a ref name stays as written.
function shortRef(ref: string): string {
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
}
