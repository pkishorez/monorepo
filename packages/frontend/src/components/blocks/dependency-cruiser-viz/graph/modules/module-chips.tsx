import { useState } from 'react';

import { cn } from '#lib/utils';

import { ROLE_TITLE, ROLE_WASH } from '../../model';
import {
  moduleTreeKeys,
  type ModuleFolderNode,
  type ModuleLeafNode,
  type ModuleTreeNode,
} from '../../model/layer-model';

/** Max sibling rows shown at one tree level before collapsing into "+N more". */
const LEVEL_ROW_CAP = 14;

/** Left padding (px) added per tree depth level. */
const INDENT_PER_DEPTH = 14;
/** Base left padding (px) for a depth-0 row. */
const INDENT_BASE = 8;

type HighlightState = {
  /** Lit modules (highlighted ∪ selected ∪ hovered) — null means rest state. */
  litModules: Set<string> | null;
  /** Module owning the graph (right-click) — gets the distinct outline. */
  selectedModule: string | null;
};

type RowActions = {
  /** Left-click: point the file tree at this module (toggle). */
  onHighlightModule: (key: string | null) => void;
  /** Right-click: select this module — opens its radial graph view. */
  onSelectModule: (key: string | null) => void;
  /** Transient hover preview — points the file tree at the row without
   * dimming the grid; inert while a module is highlighted or selected. */
  onHoverModule?: (key: string | null) => void;
};

type ModuleChipsProps = HighlightState &
  RowActions & {
    tree: ModuleTreeNode[];
    /** Keys of opaque (barrel) modules — rendered with a distinct badge. */
    opaqueKeys: ReadonlySet<string>;
  };

/**
 * A layer card's body: modules rendered as a folder tree. Folders are muted,
 * display-only placeholder rows; modules are interactive rows indented by
 * depth. Rows are neutral at rest; the color budget is spent on selection —
 * highlighted modules fill primary, the rest dims — plus a small connectivity
 * dot (root/leaf/dead).
 */
export function ModuleChips({ tree, ...rest }: ModuleChipsProps) {
  return (
    <div className="flex flex-col px-2.5 py-2">
      <NodeList nodes={tree} depth={0} {...rest} />
    </div>
  );
}

function NodeList({
  nodes,
  depth,
  opaqueKeys,
  onHighlightModule,
  onSelectModule,
  onHoverModule,
  ...highlight
}: HighlightState &
  RowActions & {
    nodes: ModuleTreeNode[];
    depth: number;
    opaqueKeys: ReadonlySet<string>;
  }) {
  const [expanded, setExpanded] = useState(false);

  const overflowing = nodes.length > LEVEL_ROW_CAP;
  const hidden = overflowing && !expanded ? nodes.slice(LEVEL_ROW_CAP) : [];
  const hiddenHasHighlight = hidden.some((node) =>
    moduleTreeKeys(node).some(
      (key) =>
        highlight.litModules?.has(key) || highlight.selectedModule === key,
    ),
  );
  const showAll = !overflowing || expanded || hiddenHasHighlight;
  const visible = showAll ? nodes : nodes.slice(0, LEVEL_ROW_CAP);

  return (
    <div className="flex flex-col">
      {visible.map((node) =>
        node.kind === 'folder' ? (
          <FolderRow
            key={`folder:${node.label}`}
            node={node}
            depth={depth}
            opaqueKeys={opaqueKeys}
            onHighlightModule={onHighlightModule}
            onSelectModule={onSelectModule}
            onHoverModule={onHoverModule}
            {...highlight}
          />
        ) : (
          <LeafRow
            key={node.module.key}
            node={node}
            depth={depth}
            isOpaqueModule={opaqueKeys.has(node.module.key)}
            onHighlightModule={onHighlightModule}
            onSelectModule={onSelectModule}
            onHoverModule={onHoverModule}
            {...highlight}
          />
        ),
      )}
      {!showAll && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(true);
          }}
          style={{ paddingLeft: INDENT_BASE + depth * INDENT_PER_DEPTH }}
          className="nodrag nopan flex w-full items-center rounded-md py-1.5 pr-2 text-left text-[11px] text-muted-foreground/70 hover:bg-muted hover:text-foreground"
        >
          +{nodes.length - LEVEL_ROW_CAP} more
        </button>
      )}
    </div>
  );
}

function FolderRow({
  node,
  depth,
  opaqueKeys,
  onHighlightModule,
  onSelectModule,
  onHoverModule,
  ...highlight
}: HighlightState &
  RowActions & {
    node: ModuleFolderNode;
    depth: number;
    opaqueKeys: ReadonlySet<string>;
  }) {
  const folderDimmed =
    highlight.litModules !== null &&
    !moduleTreeKeys(node).some((key) => highlight.litModules!.has(key));

  // A dimmed container already conveys the state — descendants render at rest
  // so opacities don't compound into near-invisibility.
  const inner = folderDimmed ? { ...highlight, litModules: null } : highlight;

  return (
    <div className={cn('flex flex-col', folderDimmed && 'opacity-35')}>
      <div
        style={{ paddingLeft: INDENT_BASE + depth * INDENT_PER_DEPTH }}
        className="truncate py-0.5 pr-2 text-[10px] font-medium tracking-wide text-muted-foreground/50"
      >
        {node.label}/
      </div>
      <NodeList
        nodes={node.children}
        depth={depth + 1}
        opaqueKeys={opaqueKeys}
        onHighlightModule={onHighlightModule}
        onSelectModule={onSelectModule}
        onHoverModule={onHoverModule}
        {...inner}
      />
    </div>
  );
}

function LeafRow({
  node,
  depth,
  isOpaqueModule,
  litModules,
  selectedModule,
  onHighlightModule,
  onSelectModule,
  onHoverModule,
}: HighlightState &
  RowActions & {
    node: ModuleLeafNode;
    depth: number;
    /** Whether this module is a declared opaque (barrel) module. */
    isOpaqueModule: boolean;
  }) {
  const module = node.module;
  const key = module.key;
  const role = module.role;
  const isHighlighted = litModules?.has(key) ?? false;
  const isDimmed = litModules !== null && !litModules.has(key);
  const isSelected = selectedModule === key;
  const breachCount = module.breachCount;
  const isBreached = breachCount > 0;

  return (
    <button
      type="button"
      title={`${module.layer} / ${module.name || '(layer root)'}${
        isOpaqueModule ? ' · opaque' : ''
      }${
        module.ruleCount > 0
          ? ` · ${module.ruleCount} rule${module.ruleCount === 1 ? '' : 's'}`
          : ''
      }${role !== 'normal' ? ` · ${ROLE_TITLE[role]}` : ''}${
        isBreached
          ? ` · ${breachCount} violation${breachCount === 1 ? '' : 's'}`
          : ''
      } — click to highlight · right-click to select`}
      onClick={(event) => {
        event.stopPropagation();
        onHighlightModule(key);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectModule(key);
      }}
      onMouseEnter={() => onHoverModule?.(key)}
      onMouseLeave={() => onHoverModule?.(null)}
      style={{
        paddingLeft: INDENT_BASE + depth * INDENT_PER_DEPTH,
        // Outline instead of border weight so selection never shifts the
        // row; inline so it can't be lost to utility-class merging.
        ...(isSelected
          ? { outline: '2px solid var(--primary)', outlineOffset: '-1px' }
          : {}),
      }}
      className={cn(
        'nodrag nopan relative flex w-full items-center gap-1.5 rounded-md border border-transparent py-1.5 pr-2 text-left text-xs transition-colors',
        'text-foreground/80 hover:border-border hover:bg-muted',
        // The role wash always shows; highlight/selection only touch the
        // border/ring so the root/leaf tint survives either state.
        ROLE_WASH[role],
        isHighlighted && 'border-primary/60 text-primary',
        isBreached && 'ring-2 ring-inset ring-destructive/50',
        isDimmed && 'opacity-35 hover:opacity-100',
        isOpaqueModule && cn('border-dashed', !isSelected && 'border-border'),
        role === 'dead' && 'italic text-muted-foreground/60',
      )}
    >
      <span className="truncate">{node.label}</span>
      {isOpaqueModule && (
        <span className="ml-auto shrink-0 rounded-sm border border-border px-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
          opaque
        </span>
      )}
      {module.ruleCount > 0 && (
        <span
          title={`${module.ruleCount} rule${module.ruleCount === 1 ? '' : 's'} configured`}
          className={cn(
            'flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-border bg-muted px-1 text-[9px] font-semibold tabular-nums text-muted-foreground',
            !isOpaqueModule && 'ml-auto',
          )}
        >
          {module.ruleCount}
        </span>
      )}
      {isBreached && (
        <span
          className={cn(
            'flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground',
            !isOpaqueModule && module.ruleCount === 0 && 'ml-auto',
          )}
        >
          {breachCount}
        </span>
      )}
    </button>
  );
}
