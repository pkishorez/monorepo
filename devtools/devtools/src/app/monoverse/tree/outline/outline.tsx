// Outline: the folder tree as a dense, editor-like indented list that
// scrolls like a page, centred. Connections curve through a gutter on the left, beside the names
// on any screen; git changes, broken links and the ignored sit quietly in
// each row. While something is selected, the rest steps back.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { scrollbarStyles } from '@kestack/web-platform/ui/components/scroll-styles';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from 'lucide-react';

import type {
  Connection,
  FolderTree,
  Row,
  TreeNode,
} from '../../model/index.js';
import { parentOf } from '../../model/index.js';
import type { NodeChange } from '../lenses/git/index.js';
import { SelectionBar } from '../selection-bar/index.js';
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
import { OutlineRow, type OutlineRowActions } from './row.js';
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
  /** How many files breaking the folder rule (or Packages in a cycle) each node holds. */
  readonly broken: ReadonlyMap<string, number>;
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
  /** Everything inside a folder open, or every folder in it closed. */
  readonly toggleInside: (path: string) => void;
}

/** Room left and right of the tree, inside the scrolling box. */
const side = 12;

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
  broken,
  changes,
  changesOn,
  dimmed,
  faded,
  ignored,
  folding,
  actions,
}: OutlineProps) {
  // The screen's width: the gutter and the column fit it, so on a phone the
  // names, their marks and every arc show without scrolling sideways.
  const frame = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState(1024);
  useEffect(() => {
    const element = frame.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      if (next > 0) setScreen(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const lead = leadFor(screen);
  const width = useMemo(
    () => columnWidth(tree, screen - 2 * side - lead - endInset),
    [tree, screen, lead],
  );
  // The tree, centred; wider than the screen, it scrolls sideways.
  const blockWidth = lead + width + endInset;
  // Room above, clear of the corner button when the tree reaches under it;
  // room below, clear of the Selection Bar.
  const room = {
    top: (screen - blockWidth) / 2 >= 64 ? 16 : 60,
    bottom: screen < 640 ? 112 : 88,
  };
  const indexOf = useMemo(() => {
    const at = new Map(rows.map(({ node }, index) => [node.path, index]));
    return (path: string) => at.get(path);
  }, [rows]);
  const place = useMemo(() => placeRows(rows), [rows]);
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
    }),
    [actions],
  );

  // Focuses a row, scrolling only as far as it takes to show it clear of
  // the corner button and the Selection Bar.
  const focusRow = useCallback((path: string) => {
    const element = content.current?.querySelector<HTMLElement>(
      `[data-path="${CSS.escape(path)}"]`,
    );
    if (element === null || element === undefined) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

  return (
    <div ref={frame} className="outline-tree relative h-full w-full">
      <div
        role="tree"
        aria-label="Folder tree"
        className={cn(
          'absolute inset-0 overflow-auto overscroll-contain select-none',
          scrollbarStyles,
        )}
        style={{
          scrollPaddingTop: room.top,
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
            ref={content}
            className="relative mx-auto"
            style={{ width: blockWidth, height: place.bottom + topInset }}
            onKeyDown={onKeyDown}
            onPointerOver={onPointerOver}
            onPointerLeave={() => hovered.set(null)}
          >
            <OutlineGuides
              guides={guides}
              current={selected === null ? null : parentOf(selected)}
            />
            {rows.map(({ node, depth }, index) => (
              <OutlineRow
                key={node.path}
                node={node}
                depth={depth}
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
                broken={broken.get(node.path) ?? 0}
                change={changes.get(node.path) ?? null}
                inside={folding.inside(node.path)}
                actions={rowActions}
              />
            ))}
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
      <div
        data-space-ignore
        className="absolute top-3 right-3 z-10 flex rounded-lg bg-background/90 p-0.5 shadow-[0_0_0_1px_var(--color-border),0_2px_8px_-2px_rgb(0_0_0/0.15)] backdrop-blur-md"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-10"
          aria-label={
            folding.all ? 'Collapse all folders' : 'Expand all folders'
          }
          title={folding.all ? 'Collapse all folders' : 'Expand all folders'}
          onClick={actions.toggleAll}
        >
          {folding.all ? (
            <ChevronsDownUpIcon className="size-3.5" />
          ) : (
            <ChevronsUpDownIcon className="size-3.5" />
          )}
        </Button>
      </div>
      <SelectionBar
        scope={scope}
        node={selectedNode ?? tree.root}
        root={selectedNode === undefined}
        changesOn={changesOn}
        connections={connections}
        colours={outlineColours}
        onActivate={() => actions.view(selectedNode ?? tree.root)}
        onChanges={
          selectedNode?.kind === 'package'
            ? () => actions.changes(selectedNode)
            : undefined
        }
        onClear={() => actions.select(null)}
      />
    </div>
  );
}
