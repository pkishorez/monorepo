import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@kestack/web-platform/ui/components/button';
import { scrollbarStyles } from '@kestack/web-platform/ui/components/scroll-styles';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  RotateCcwIcon,
} from 'lucide-react';

import { parentOf } from '../../../../../../../../server/rpc/contract/index.js';
import type { FolderTree, Row, TreeNode } from '../../logic/shared/index.js';
import type {
  Connection,
  Finding,
  Findings,
} from '../../logic/shared/index.js';
import {
  placesAmongSiblings,
  usePanelSlots,
  useVirtualRows,
} from '../../../../../view/shared/index.js';
import type { NodeChange } from '../lenses/git.js';
import { SelectionBar } from '../selection-bar/selection-bar.js';
import { OutlineArcs, createHovered } from './arcs.js';
import { OutlineGuides } from './guides.js';
import {
  columnWidth,
  endInset,
  guidesOf,
  leadFor,
  placeRows,
  topInset,
} from './layout.js';
import { OutlineRow, type OutlineRowActions, type RowOpens } from './row.js';
import './outline.css';

export interface OutlineProps {
  readonly scope: 'repo' | 'package';
  readonly tree: FolderTree;
  readonly open: ReadonlySet<string>;
  readonly rows: ReadonlyArray<Row>;
  readonly selected: string | null;
  readonly connections: ReadonlyMap<string, Connection>;
  readonly findings: Findings;
  readonly selectionFindings: ReadonlyArray<Finding>;
  readonly changes: ReadonlyMap<string, NodeChange>;
  readonly changesOn: boolean;
  readonly dimmed: (path: string) => boolean;
  readonly faded: (path: string) => boolean;
  readonly ignored: (path: string) => boolean;
  readonly folding: {
    readonly all: boolean;
    readonly inside: (path: string) => boolean | null;
  };
  readonly atHome: boolean;
  readonly actions: TreeActions;
}

export interface TreeActions {
  readonly select: (path: string | null) => void;
  readonly toggle: (path: string) => void;
  readonly activate: (node: TreeNode) => void;
  readonly view: (node: TreeNode) => void;
  readonly changes: (node: TreeNode) => void;
  readonly reveal: (path: string) => void;
  readonly toggleAll: () => void;
  readonly reset: () => void;
  readonly toggleInside: (path: string) => void;
}

const side = 12;
const topBarHeight = 32;

const outlineColours = {
  uses: 'var(--outline-uses)',
  usedBy: 'var(--outline-used-by)',
  broken: 'var(--outline-broken)',
};

export function Outline({
  scope,
  tree,
  rows,
  open,
  selected,
  connections,
  findings,
  selectionFindings,
  changes,
  changesOn,
  dimmed,
  faded,
  ignored,
  folding,
  atHome,
  actions,
}: OutlineProps) {
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState(0);
  useLayoutEffect(() => {
    const element = frame.current;
    if (element === null) return;
    setScreen(Math.round(element.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      if (next > 0) setScreen(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const lead = leadFor(screen);
  const width = columnWidth(screen - 2 * side - lead - endInset);
  const blockWidth = lead + width + endInset;
  const slots = usePanelSlots();
  const room = {
    top: 12,
    bottom: slots.docked ? 32 : screen < 640 ? 112 : 88,
  };
  const indexOf = useMemo(() => {
    const at = new Map(rows.map(({ node }, index) => [node.path, index]));
    return (path: string) => at.get(path);
  }, [rows]);
  const place = useMemo(() => placeRows(rows), [rows]);
  const among = useMemo(
    () => placesAmongSiblings(rows.map(({ depth }) => depth)),
    [rows],
  );
  const guides = useMemo(
    () => guidesOf(rows, place, lead),
    [rows, place, lead],
  );
  const [hovered] = useState(createHovered);
  const content = useRef<HTMLDivElement>(null);
  const byKeys = useRef(false);

  const latest = useRef({ rows, open, selected, connections, indexOf });
  latest.current = { rows, open, selected, connections, indexOf };

  const rowActions = useMemo<OutlineRowActions>(
    () => ({
      press: (node) => {
        byKeys.current = false;
        actions.select(node.path);
      },
      toggle: actions.toggle,
      activate: actions.activate,
      reveal: actions.reveal,
      toggleInside: actions.toggleInside,
      open: (node) =>
        node.kind === 'package' ? actions.changes(node) : actions.view(node),
    }),
    [actions],
  );
  const opensOf = (node: TreeNode): RowOpens =>
    changesOn || node.kind === 'package' ? 'diff' : 'view';

  const reachRow = useRef<(index: number, then: () => void) => void>(
    () => undefined,
  );
  const focusRow = useCallback((path: string) => {
    const index = latest.current.indexOf(path);
    if (index === undefined) return;
    reachRow.current(index, () => {
      const element = content.current?.querySelector<HTMLElement>(
        `[data-path="${CSS.escape(path)}"]`,
      );
      if (element === null || element === undefined) return;
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) return;
      const path = event.target
        .closest('[data-row]')
        ?.getAttribute('data-path');
      if (path === null || path === undefined) return;
      const { rows, open, selected, connections, indexOf } = latest.current;
      const at = indexOf(path);
      if (at === undefined) return;
      const { node, depth } = rows[at]!;
      const isFolder = node.kind === 'folder';
      let next: string | undefined;
      switch (event.key) {
        case 'ArrowDown':
          next = rows[at + 1]?.node.path;
          break;
        case 'ArrowUp':
          next = rows[at - 1]?.node.path;
          break;
        case 'Home':
          next = rows[0]?.node.path;
          break;
        case 'End':
          next = rows.at(-1)?.node.path;
          break;
        case 'ArrowRight':
          if (isFolder && !open.has(node.path)) {
            if (connections.has(node.path)) actions.reveal(node.path);
            else actions.toggle(node.path);
          } else if (isFolder && rows[at + 1]?.depth === depth + 1) {
            next = rows[at + 1]!.node.path;
          }
          break;
        case 'ArrowLeft':
          if (isFolder && open.has(node.path)) actions.toggle(node.path);
          else if (depth > 0) next = parentOf(node.path);
          break;
        case 'Enter':
          actions.activate(node);
          break;
        case ' ':
          byKeys.current = true;
          actions.select(node.path);
          break;
        case 'Escape':
          if (selected === null) return;
          actions.select(null);
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (next === undefined) return;
      byKeys.current = true;
      if (next !== selected) actions.select(next);
      focusRow(next);
    },
    [actions, focusRow],
  );

  const onPointerOver = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) return;
      if (event.pointerType !== 'mouse') return hovered.set(null);
      hovered.set(
        event.target.closest('[data-row]')?.getAttribute('data-path') ?? null,
      );
    },
    [hovered],
  );

  const selectedIndex = selected === null ? undefined : indexOf(selected);
  const selectedNode: TreeNode | undefined =
    selected === null ? undefined : tree.nodes.get(selected);
  const tabbable =
    selectedIndex === undefined ? rows[0]?.node.path : (selected ?? undefined);

  const [focused, setFocused] = useState<string | null>(null);
  const keyOf = useCallback(
    (index: number) => rows[index]?.node.path ?? String(index),
    [rows],
  );
  const drawn = useVirtualRows({
    count: rows.length,
    scroller,
    sizeOf: place.height,
    keyOf,
    offset: room.top + topBarHeight + topInset,
    keep: [
      selectedIndex,
      tabbable === undefined ? undefined : indexOf(tabbable),
      focused === null ? undefined : indexOf(focused),
    ],
  });
  reachRow.current = drawn.reach;

  const reset = () => {
    byKeys.current = false;
    actions.reset();
    scroller.current?.scrollTo({ top: 0, left: 0 });
  };
  const FoldIcon = folding.all ? ChevronsDownUpIcon : ChevronsUpDownIcon;
  const selectionBar = (panel: boolean) => (
    <SelectionBar
      panel={panel}
      scope={scope}
      node={selectedNode ?? tree.root}
      root={selectedNode === undefined}
      changesOn={changesOn}
      connections={connections}
      findings={selectionFindings}
      colours={outlineColours}
      onActivate={() => actions.view(selectedNode ?? tree.root)}
      onChanges={
        selectedNode?.kind === 'package'
          ? () => actions.changes(selectedNode)
          : undefined
      }
      onClear={() => actions.select(null)}
    />
  );

  return (
    <div ref={frame} className="outline-tree relative h-full w-full">
      <div
        ref={scroller}
        role="tree"
        aria-label="Folder tree"
        className={cn(
          'absolute inset-0 overflow-auto overscroll-contain select-none',
          scrollbarStyles,
        )}
        style={{
          scrollPaddingTop: topBarHeight,
          scrollPaddingBottom: room.bottom,
        }}
        onClick={(event) => {
          if (!(event.target instanceof Element)) return;
          if (event.target.closest('[data-row], [data-space-ignore]') !== null)
            return;
          byKeys.current = false;
          if (latest.current.selected !== null) actions.select(null);
        }}
      >
        <div
          className="w-max min-w-full"
          style={{
            paddingTop: room.top,
            paddingBottom: room.bottom,
            paddingInline: side,
          }}
        >
          <div
            data-space-ignore
            className="sticky top-0 z-20 mx-auto flex items-center justify-between bg-background"
            style={{
              width: blockWidth,
              height: topBarHeight,
              paddingLeft: lead,
              paddingRight: endInset,
            }}
          >
            <Button
              variant="ghost"
              size="xs"
              className="-ml-1 gap-1.5 px-1.5 font-normal text-muted-foreground"
              aria-pressed={folding.all}
              onClick={actions.toggleAll}
            >
              <FoldIcon className="size-3.5" />
              {folding.all ? 'Collapse all' : 'Expand all'}
            </Button>
            {slots.docked ? null : (
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground max-sm:size-9"
                aria-label="Reset to the default view"
                title="Reset to the default view"
                disabled={atHome}
                onClick={reset}
              >
                <RotateCcwIcon className="size-3.5" />
              </Button>
            )}
          </div>
          <div
            ref={content}
            className="relative mx-auto"
            style={{ width: blockWidth, height: place.bottom + topInset }}
            onKeyDown={onKeyDown}
            onPointerOver={onPointerOver}
            onPointerLeave={() => hovered.set(null)}
            onFocus={(event) => {
              const path = event.target
                .closest('[data-row]')
                ?.getAttribute('data-path');
              if (path !== null && path !== undefined) setFocused(path);
            }}
          >
            <OutlineGuides
              guides={guides}
              current={selected === null ? null : parentOf(selected)}
            />
            {drawn.indices.map((index) => {
              const { node, depth } = rows[index]!;
              return (
                <OutlineRow
                  key={node.path}
                  node={node}
                  depth={depth}
                  among={among[index]!}
                  top={place.top(index)}
                  height={place.height(index)}
                  lead={lead}
                  width={width}
                  open={open.has(node.path)}
                  selected={node.path === selected}
                  tabbable={node.path === tabbable}
                  ignored={ignored(node.path)}
                  dimmed={dimmed(node.path)}
                  faded={faded(node.path)}
                  connection={connections.get(node.path) ?? null}
                  violations={findings.violations.get(node.path) ?? 0}
                  cycle={(findings.cycles.get(node.path) ?? 0) > 0}
                  check={findings.checks.get(node.path) ?? null}
                  change={changes.get(node.path) ?? null}
                  inside={folding.inside(node.path)}
                  opens={opensOf(node)}
                  actions={rowActions}
                />
              );
            })}
            {selected !== null && selectedIndex !== undefined ? (
              <OutlineArcs
                selected={selected}
                selectedIndex={selectedIndex}
                connections={connections}
                indexOf={indexOf}
                place={place}
                lead={lead}
                hovered={hovered}
                still={byKeys.current}
              />
            ) : null}
          </div>
        </div>
      </div>
      {slots.folders === null
        ? null
        : createPortal(
            <Button
              variant="outline"
              size="sm"
              className="mx-1"
              disabled={atHome}
              onClick={reset}
            >
              <RotateCcwIcon data-icon="inline-start" />
              Reset to default view
            </Button>,
            slots.folders,
          )}
      {!slots.docked
        ? selectionBar(false)
        : slots.selection === null
          ? null
          : createPortal(
              <div className="outline-tree">{selectionBar(true)}</div>,
              slots.selection,
            )}
    </div>
  );
}
