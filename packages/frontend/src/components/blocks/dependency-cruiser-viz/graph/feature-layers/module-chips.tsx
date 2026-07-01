import { useState } from 'react';

import { cn } from '#lib/utils';

import {
  chipKeys,
  type ChipGroup,
  type ModuleChip,
} from '../../model/layer-model';

/** Max top-level rows shown per folder group before collapsing into "+N more". */
const GROUP_CHIP_CAP = 12;

/** Left padding (px) added per containment depth level. */
const INDENT_PER_DEPTH = 14;
/** Base left padding (px) for a depth-0 row. */
const INDENT_BASE = 8;

type HighlightState = {
  /** Highlighted modules — null means nothing selected (rest state). */
  highlightedModules: Set<string> | null;
  selectedModule: string | null;
};

type RowActions = {
  onSelectModule: (key: string | null) => void;
  /** Transient focus while pointing at a row — dims the other modules. */
  onHoverModule?: (key: string | null) => void;
};

type ModuleChipsProps = HighlightState &
  RowActions & {
    groups: ChipGroup[];
  };

/**
 * A layer card's body: folder groups rendered as a full-width vertical list, one
 * module per row. Rows indent by containment depth so the module hierarchy is
 * scannable. Rows are neutral at rest; the color budget is spent on feature
 * selection — highlighted modules fill primary, the rest dims.
 */
export function ModuleChips({
  groups,
  highlightedModules,
  selectedModule,
  onSelectModule,
  onHoverModule,
}: ModuleChipsProps) {
  return (
    <div className="flex flex-col gap-2.5 px-2.5 py-2">
      {groups.map((group) => (
        <FolderGroup
          key={group.folder ?? ''}
          group={group}
          highlightedModules={highlightedModules}
          selectedModule={selectedModule}
          onSelectModule={onSelectModule}
          onHoverModule={onHoverModule}
        />
      ))}
    </div>
  );
}

function FolderGroup({
  group,
  onSelectModule,
  onHoverModule,
  ...highlight
}: HighlightState &
  RowActions & {
    group: ChipGroup;
  }) {
  const [expanded, setExpanded] = useState(false);

  const overflowing = group.chips.length > GROUP_CHIP_CAP;
  const hidden =
    overflowing && !expanded ? group.chips.slice(GROUP_CHIP_CAP) : [];
  const hiddenHasHighlight = hidden.some((chip) =>
    chipKeys(chip).some(
      (key) =>
        highlight.highlightedModules?.has(key) ||
        highlight.selectedModule === key,
    ),
  );
  const showAll = !overflowing || expanded || hiddenHasHighlight;
  const visible = showAll ? group.chips : group.chips.slice(0, GROUP_CHIP_CAP);

  const groupDimmed =
    highlight.highlightedModules !== null &&
    !group.chips.some((chip) =>
      chipKeys(chip).some((key) => highlight.highlightedModules!.has(key)),
    );

  // A dimmed container already conveys the state — descendants render at rest
  // so opacities don't compound into near-invisibility.
  const inner = groupDimmed
    ? { ...highlight, highlightedModules: null }
    : highlight;

  return (
    <div className={cn('flex flex-col gap-0.5', groupDimmed && 'opacity-35')}>
      {group.folder && (
        <div className="truncate px-2 text-[10px] font-medium tracking-wide text-muted-foreground/60">
          {group.folder}/
        </div>
      )}
      <div className="flex flex-col">
        {visible.map((chip) => (
          <ModuleRow
            key={chip.module.key}
            chip={chip}
            depth={0}
            onSelectModule={onSelectModule}
            onHoverModule={onHoverModule}
            {...inner}
          />
        ))}
        {!showAll && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(true);
            }}
            style={{ paddingLeft: INDENT_BASE }}
            className="nodrag nopan flex w-full items-center rounded-md py-1.5 pr-2 text-left text-[11px] text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            +{group.chips.length - GROUP_CHIP_CAP} more
          </button>
        )}
      </div>
    </div>
  );
}

function ModuleRow({
  chip,
  depth,
  onSelectModule,
  onHoverModule,
  ...highlight
}: HighlightState &
  RowActions & {
    chip: ModuleChip;
    depth: number;
  }) {
  const { highlightedModules } = highlight;

  const subtreeDimmed =
    highlightedModules !== null &&
    !chipKeys(chip).some((key) => highlightedModules.has(key));

  // Once a subtree is dimmed as a whole, descendants render at rest so the
  // opacities don't compound across nesting levels.
  const inner = subtreeDimmed
    ? { ...highlight, highlightedModules: null }
    : highlight;

  return (
    <>
      <LeafRow
        chip={chip}
        depth={depth}
        rowDimmed={subtreeDimmed}
        onSelectModule={onSelectModule}
        onHoverModule={onHoverModule}
        {...highlight}
      />
      {chip.children.map((child) => (
        <ModuleRow
          key={child.module.key}
          chip={child}
          depth={depth + 1}
          onSelectModule={onSelectModule}
          onHoverModule={onHoverModule}
          {...inner}
        />
      ))}
    </>
  );
}

function LeafRow({
  chip,
  depth,
  rowDimmed,
  highlightedModules,
  selectedModule,
  onSelectModule,
  onHoverModule,
}: HighlightState &
  RowActions & {
    chip: ModuleChip;
    depth: number;
    /** Whether the whole subtree (computed by the parent) is dimmed. */
    rowDimmed: boolean;
  }) {
  const key = chip.module.key;
  const isHighlighted = highlightedModules?.has(key) ?? false;
  const isDimmed =
    rowDimmed && highlightedModules !== null && !highlightedModules.has(key);
  const isSelected = selectedModule === key;
  const breachCount = chip.module.breachCount;
  const isBreached = breachCount > 0;

  return (
    <button
      type="button"
      title={`${chip.module.layer} / ${chip.module.name || '(layer root)'}${
        isBreached
          ? ` · ${breachCount} violation${breachCount === 1 ? '' : 's'}`
          : ''
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onSelectModule(isSelected ? null : key);
      }}
      onMouseEnter={() => onHoverModule?.(key)}
      onMouseLeave={() => onHoverModule?.(null)}
      style={{ paddingLeft: INDENT_BASE + depth * INDENT_PER_DEPTH }}
      className={cn(
        'nodrag nopan relative flex w-full items-center gap-1.5 rounded-md border border-transparent py-1.5 pr-2 text-left text-xs transition-colors',
        'text-foreground/80 hover:border-border hover:bg-muted',
        isHighlighted &&
          'border-primary/60 bg-primary/15 text-primary hover:bg-primary/25',
        isBreached && 'ring-2 ring-inset ring-destructive/50',
        isDimmed && 'opacity-35 hover:opacity-100',
        isSelected && 'ring-2 ring-inset ring-primary',
      )}
    >
      <span className="truncate">{chip.label}</span>
      {isBreached && (
        <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
          {breachCount}
        </span>
      )}
    </button>
  );
}
