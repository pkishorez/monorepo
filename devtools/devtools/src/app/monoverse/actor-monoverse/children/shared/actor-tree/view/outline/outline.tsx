// Outline: the folder tree as a dense, editor-like indented list that
// scrolls like a page, centred. Connections curve through a gutter on the left, beside the names
// on any screen; git changes, broken links and the ignored sit quietly in
// each row. While something is selected, the rest steps back.
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

import { parentOf } from '../../../../../../server/rpc/contract/index.js';
import type {
  FolderTree,
  Row,
  TreeNode,
} from '../../../../../logic/shared/index.js';
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

/** What Outline draws: the facts the Tree view works out from its Model and Props. */
export interface OutlineProps {
  /** `repo`: a Monorepo, each Package one closed node. `package`: one Package's files. */
  readonly scope: 'repo' | 'package';
  /** The whole tree; `tree.root` is never drawn itself. */
  readonly tree: FolderTree;
  /** The folders open. */
  readonly open: ReadonlySet<string>;
  /** The nodes showing, top to bottom, depth-first: inside every open folder, less hidden ones. */
  readonly rows: ReadonlyArray<Row>;
  readonly selected: string | null;
  /**
   * What the selection connects to, keyed by the node showing that holds
   * the far end: a sibling, something beside an ancestor, or a closed
   * folder standing for everything in it.
   */
  readonly connections: ReadonlyMap<string, Connection>;
  /** How many Violations, and Packages in a cycle, each node holds, and each Package's Check. */
  readonly findings: Findings;
  /** What is wrong with the selection, each with what to do about it. */
  readonly selectionFindings: ReadonlyArray<Finding>;
  /** What changed in each node since Compare-to; empty while Changes is off. */
  readonly changes: ReadonlyMap<string, NodeChange>;
  /** Whether Changes is on, so a folder is viewed for its changes. */
  readonly changesOn: boolean;
  /**
   * While something is selected, whether a node steps back: all but the
   * selection, what is inside it, what it connects to, and the folders
   * holding those.
   */
  readonly dimmed: (path: string) => boolean;
  /** While Changes is on and the unchanged are dimmed: whether the branch left a node unchanged. */
  readonly faded: (path: string) => boolean;
  /** Outside the Source roots: drawn dimmed, never analysed. */
  readonly ignored: (path: string) => boolean;
  /**
   * Which folders open and close everything inside them at once: those
   * holding folders, each whether all of it is open; and whether every
   * folder in the tree is.
   */
  readonly folding: {
    readonly all: boolean;
    readonly inside: (path: string) => boolean | null;
  };
  /** The tree is as it opened: the default view, nothing selected. */
  readonly atHome: boolean;
  readonly actions: TreeActions;
}

export interface TreeActions {
  /** Selects a node; the selected one, or null, lets go. */
  readonly select: (path: string | null) => void;
  /** Opens or closes a folder. */
  readonly toggle: (path: string) => void;
  /** Double click: opens a folder, a file in the viewer, a Package in its own view. */
  readonly activate: (node: TreeNode) => void;
  /**
   * The selection bar's one button: a file in the viewer, a Package in
   * its own view, a folder (the root too) in the folder viewer.
   */
  readonly view: (node: TreeNode) => void;
  /** A Package's changes, from the repository's tree, in the folder viewer. */
  readonly changes: (node: TreeNode) => void;
  /** Opens the folders down to what a connected closed folder holds that is connected. */
  readonly reveal: (path: string) => void;
  /** Every folder open, or, if every one is, all closed down to the top level. */
  readonly toggleAll: () => void;
  /** Back to the default view: the folders open at first, nothing selected. */
  readonly reset: () => void;
  /** Everything inside a folder open, or every folder in it closed. */
  readonly toggleInside: (path: string) => void;
}

/** Room left and right of the tree, inside the scrolling box. */
const side = 12;
/** The bar held at the top of the tree as it scrolls: the fold toggle, and reset. */
const topBarHeight = 32;

// The Selection Bar's key, in the colours the arcs are drawn in.
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
  // The screen's width: the gutter and the column fit it, so on a phone the
  // names, their marks and every arc show without scrolling sideways.
  // Measured before the first paint, so the tree never moves once drawn.
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
  // The same for every tree, so moving between them moves nothing.
  const width = columnWidth(screen - 2 * side - lead - endInset);
  // The tree, centred; wider than the screen, it scrolls sideways.
  const blockWidth = lead + width + endInset;
  // On a wide screen the side panels hold what is selected and the reset
  // button; elsewhere the Selection Bar sits over the tree, and reset in
  // the tree's own top bar. Room below, clear of the Selection Bar; rows
  // brought into view by the keys stop clear of the top bar.
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
  // Whether the selection last moved by the keys: those moves never animate.
  const byKeys = useRef(false);

  // Read by the handlers as they run, so nothing draws again for them.
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
  // What each row's open button opens, on every row at any depth: what
  // changed in it while Changes is on, or a Package's changes, which turn
  // Changes on; else a file, or a folder's files.
  const opensOf = (node: TreeNode): RowOpens =>
    changesOn || node.kind === 'package' ? 'diff' : 'view';

  // Focuses a row, scrolling only as far as it takes to show it clear of
  // the corner button and the Selection Bar.
  // The row may be far out of sight, and not drawn: it is drawn first.
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
            // Into a closed folder the selection reaches: open it to what it holds.
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
      // Arrows are the tree's here, not the prototype picker's.
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
      // A finger has no hover: a tap must not leave the other arcs faded.
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

  // Only the rows that show are drawn, and those the keys and Tab need
  // wherever the tree is scrolled: the selection, the row Tab lands on,
  // and the one focused.
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
          // Neither a row nor the controls over the tree: empty space.
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
              // Its colours are the tree's own.
              <div className="outline-tree">{selectionBar(true)}</div>,
              slots.selection,
            )}
    </div>
  );
}
