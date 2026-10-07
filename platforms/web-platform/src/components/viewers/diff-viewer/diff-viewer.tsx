import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  ChevronsLeftRight,
  ChevronsUpDown,
  Columns2,
  PanelLeft,
  PanelRight,
  Rows3,
  WrapText,
} from 'lucide-react';
import type { FileDiff } from 'laymos';

import { SourceViewer } from '../source-viewer';
import { Button } from '#components/ui/button';
import { Switch } from '#components/ui/switch';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { collapseRows } from './collapse';
import {
  fullSide,
  sideOfRows,
  splitRows,
  unifiedChunks,
  type SideContent,
} from './render-model';
import { clearRowHeights, equalizeRowHeights, syncScroll } from './sync-rows';

export type DiffLayout = 'split' | 'unified';

type PaneMode = 'both' | 'before' | 'after';

const paneModes: Readonly<
  Record<
    PaneMode,
    {
      readonly label: string;
      readonly hint: string;
      readonly next: PaneMode;
      readonly icon: ReactNode;
    }
  >
> = {
  both: {
    label: 'Both',
    hint: 'Showing both sides — collapse the after side',
    next: 'before',
    icon: <Columns2 className="size-3.5" />,
  },
  before: {
    label: 'Before',
    hint: 'Showing the base version — collapse the before side instead',
    next: 'after',
    icon: <PanelLeft className="size-3.5" />,
  },
  after: {
    label: 'After',
    hint: 'Showing the working tree version — show both sides again',
    next: 'both',
    icon: <PanelRight className="size-3.5" />,
  },
};

export interface DiffViewerProps {
  readonly diff: FileDiff;
  readonly defaultLayout?: DiffLayout;
  readonly fallbackContent?: string;
  readonly className?: string;
}

interface ViewChunk {
  readonly collapsible: boolean;
  readonly count: number;
  readonly left: SideContent;
  readonly right: SideContent;
}

export function DiffViewer({
  diff,
  defaultLayout = 'split',
  fallbackContent,
  className,
}: DiffViewerProps) {
  const [layout, setLayout] = useState<DiffLayout>(defaultLayout);
  const [wrap, setWrap] = useState(false);
  const [panes, setPanes] = useState<PaneMode>('both');
  // Keyed by layout: split and unified fold different sequences, so an index
  // expanded in one must not silently expand a different region in the other.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef(false);

  // Built once per diff: SourceViewer compares lineStatuses by identity, so
  // rebuilding these during render would re-highlight on every pass.
  const chunks = useMemo<readonly ViewChunk[]>(
    () =>
      collapseRows(splitRows(diff.hunks)).map((chunk) => ({
        collapsible: chunk.kind === 'unchanged' && chunk.collapsible,
        count: chunk.rows.length,
        left: sideOfRows(chunk.rows, 'left'),
        right: sideOfRows(chunk.rows, 'right'),
      })),
    [diff.hunks],
  );
  const unified = useMemo(() => unifiedChunks(diff.hunks), [diff.hunks]);
  const activeChunks = layout === 'unified' ? unified : chunks;
  const collapsibleKeys = useMemo(
    () =>
      activeChunks.flatMap((chunk, index) =>
        chunk.collapsible ? [`${layout}-${index}`] : [],
      ),
    [activeChunks, layout],
  );
  const allExpanded = collapsibleKeys.every((key) => expanded.has(key));
  const expandAllDisabled = collapsibleKeys.length === 0;
  const beforeFile = useMemo(() => fullSide(diff.hunks, 'left'), [diff.hunks]);
  const afterFile = useMemo(() => fullSide(diff.hunks, 'right'), [diff.hunks]);
  const counts = useMemo(() => countChanges(diff), [diff]);

  useLayoutEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (left === null || right === null) {
      // With one side hidden there is nothing to pair rows against.
      if (left !== null) clearRowHeights(left);
      if (right !== null) clearRowHeights(right);
      return;
    }

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => equalizeRowHeights(left, right));
    };
    schedule();

    const mutations = new MutationObserver(schedule);
    mutations.observe(left, { childList: true, subtree: true });
    mutations.observe(right, { childList: true, subtree: true });
    const resizes = new ResizeObserver(schedule);
    resizes.observe(left);
    resizes.observe(right);
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resizes.disconnect();
    };
  }, [chunks, wrap, expanded, layout, panes]);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (left === null || right === null) return;

    const onLeft = () => syncScroll(left, right, scrollLock);
    const onRight = () => syncScroll(right, left, scrollLock);
    left.addEventListener('scroll', onLeft);
    right.addEventListener('scroll', onRight);
    return () => {
      left.removeEventListener('scroll', onLeft);
      right.removeEventListener('scroll', onRight);
    };
  }, [layout, panes]);

  if (diff.hunks.length === 0) {
    return fallbackContent === undefined ? (
      <div
        className={cn(
          'grid size-full place-items-center text-sm text-muted-foreground',
          className,
        )}
      >
        No changes against the base ref.
      </div>
    ) : (
      <SourceViewer
        filePath={diff.path}
        content={fallbackContent}
        wrap={wrap}
        className={className}
      />
    );
  }

  const expand = (key: string) =>
    setExpanded((current) => new Set(current).add(key));

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={layout === 'unified'}
          aria-label={paneModes[panes].hint}
          title={paneModes[panes].hint}
          onClick={() => setPanes(paneModes[panes].next)}
        >
          {paneModes[panes].icon}
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {diff.path}
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
          <span className="text-green-600 dark:text-green-400">{`+${counts.added}`}</span>
          <span className="text-rose-600 dark:text-rose-400">{`-${counts.removed}`}</span>
        </span>
        <label
          className={cn(
            'flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground',
            expandAllDisabled ? 'opacity-50' : 'cursor-pointer',
          )}
        >
          <ChevronsUpDown className="size-3.5" />
          Expand all
          <Switch
            size="sm"
            disabled={expandAllDisabled}
            checked={allExpanded && !expandAllDisabled}
            onCheckedChange={(checked) =>
              setExpanded(checked ? new Set(collapsibleKeys) : new Set())
            }
          />
        </label>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <WrapText className="size-3.5" />
          Wrap
          <Switch size="sm" checked={wrap} onCheckedChange={setWrap} />
        </label>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <Rows3 className="size-3.5" />
          Unified
          <Switch
            size="sm"
            checked={layout === 'unified'}
            onCheckedChange={(checked) =>
              setLayout(checked ? 'unified' : 'split')
            }
          />
        </label>
      </header>
      {layout === 'unified' ? (
        <div
          className={cn(
            'min-h-0 flex-1 overflow-auto bg-background',
            scrollbarStyles,
          )}
        >
          <div className={cn('min-w-full', wrap ? 'w-full' : 'w-max')}>
            {unified.map((chunk, index) =>
              chunk.collapsible && !expanded.has(`unified-${index}`) ? (
                <CollapsedRegion
                  key={index}
                  count={chunk.count}
                  onExpand={() => expand(`unified-${index}`)}
                />
              ) : (
                <SourceViewer
                  key={index}
                  filePath={diff.path}
                  content={chunk.side.content}
                  lineStatuses={chunk.side.lines}
                  showHeader={false}
                  wrap={wrap}
                  autoHeight
                />
              ),
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 bg-background">
          {panes === 'after' ? (
            <CollapsedPane label="Before" onExpand={() => setPanes('both')} />
          ) : panes === 'before' ? (
            // One side alone is the whole file, not a diff with its padding
            // stripped out.
            <WholeFile filePath={diff.path} side={beforeFile} wrap={wrap} />
          ) : (
            <Pane
              paneRef={leftRef}
              filePath={diff.path}
              chunks={chunks}
              side="left"
              wrap={wrap}
              expanded={expanded}
              onExpand={expand}
              className="w-1/2 shrink-0"
            />
          )}
          {panes === 'before' ? (
            <CollapsedPane label="After" onExpand={() => setPanes('both')} />
          ) : panes === 'after' ? (
            <WholeFile filePath={diff.path} side={afterFile} wrap={wrap} />
          ) : (
            <Pane
              paneRef={rightRef}
              filePath={diff.path}
              chunks={chunks}
              side="right"
              wrap={wrap}
              expanded={expanded}
              onExpand={expand}
              className="w-1/2 shrink-0 border-s border-border"
            />
          )}
        </div>
      )}
    </div>
  );
}

// Both panes render the same sequence of chunks and separators, so their rows
// stay paired by position no matter which side is taller.
function Pane({
  paneRef,
  filePath,
  chunks,
  side,
  wrap,
  expanded,
  onExpand,
  className,
}: {
  readonly paneRef: Ref<HTMLDivElement>;
  readonly filePath: string;
  readonly chunks: readonly ViewChunk[];
  readonly side: 'left' | 'right';
  readonly wrap: boolean;
  readonly expanded: ReadonlySet<string>;
  readonly onExpand: (key: string) => void;
  readonly className?: string;
}) {
  return (
    <div
      ref={paneRef}
      // Own the background: content shorter than the pane would otherwise let
      // the parent's colour show through below the last line.
      className={cn(
        'h-full overflow-auto bg-background',
        scrollbarStyles,
        className,
      )}
    >
      {/* One shared width for every chunk, so no row's background stops short
          of the widest line once the pane is scrolled sideways. */}
      <div className={cn('min-w-full', wrap ? 'w-full' : 'w-max')}>
        {chunks.map((chunk, index) =>
          chunk.collapsible && !expanded.has(`split-${index}`) ? (
            <CollapsedRegion
              key={index}
              count={chunk.count}
              silent={side === 'right'}
              onExpand={() => onExpand(`split-${index}`)}
            />
          ) : (
            <SourceViewer
              key={index}
              filePath={filePath}
              content={chunk[side].content}
              lineStatuses={chunk[side].lines}
              showHeader={false}
              wrap={wrap}
              autoHeight
            />
          ),
        )}
      </div>
    </div>
  );
}

function WholeFile({
  filePath,
  side,
  wrap,
}: {
  readonly filePath: string;
  readonly side: SideContent;
  readonly wrap: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 overflow-auto bg-background',
        scrollbarStyles,
      )}
    >
      <SourceViewer
        filePath={filePath}
        content={side.content}
        lineStatuses={side.lines}
        showHeader={false}
        wrap={wrap}
        autoHeight
      />
    </div>
  );
}

// Collapsing to a labelled strip rather than hiding outright, so it stays
// obvious which side was minimised and how to bring it back.
function CollapsedRegion({
  count,
  silent = false,
  onExpand,
}: {
  readonly count: number;
  readonly silent?: boolean;
  readonly onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex h-7 w-full items-center justify-center gap-2 border-y border-border bg-muted/50 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
    >
      {!silent && <ChevronsUpDown className="size-3.5" />}
      {silent ? '' : `Show ${count} unchanged lines`}
    </button>
  );
}

function CollapsedPane({
  label,
  onExpand,
}: {
  readonly label: string;
  readonly onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Show the ${label.toLowerCase()} side`}
      className="flex h-full w-9 shrink-0 flex-col items-center justify-center gap-2 border-s border-border bg-muted/50 py-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ChevronsLeftRight className="size-3.5 shrink-0" />
      <span className="flex flex-col items-center text-[11px] font-medium leading-[1.15]">
        {[...label].map((letter, index) => (
          <span key={`${letter}-${index}`}>{letter}</span>
        ))}
      </span>
    </button>
  );
}

function countChanges(diff: FileDiff): {
  readonly added: number;
  readonly removed: number;
} {
  const lines = diff.hunks.flatMap((hunk) => hunk.lines);
  return {
    added: lines.filter(({ kind }) => kind === 'added').length,
    removed: lines.filter(({ kind }) => kind === 'removed').length,
  };
}
