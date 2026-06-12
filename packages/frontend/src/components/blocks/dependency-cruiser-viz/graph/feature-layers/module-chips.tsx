import { useState } from 'react';

import { cn } from '#lib/utils';

import { VISIBILITY_COLOR } from '../../model';
import {
  chipKeys,
  type ChipGroup,
  type ModuleChip,
} from '../../model/layer-model';

/** Max chips shown per folder group before collapsing into "+N more". */
const GROUP_CHIP_CAP = 12;

type HighlightState = {
  /** Union of owned ∪ consumed — null means nothing selected (rest state). */
  highlightedModules: Set<string> | null;
  ownedModules: Set<string> | null;
  consumedModules: Set<string> | null;
  selectedModule: string | null;
};

type ModuleChipsProps = HighlightState & {
  groups: ChipGroup[];
  onSelectModule: (key: string | null) => void;
};

/**
 * A layer card's body: folder groups of module chips. Chips are neutral at
 * rest (visibility tier shown as a dot); the color budget is spent on feature
 * selection — owned fills primary, consumed gets a dashed outline, the rest
 * dims. Nested chips render inside their parent module's card.
 */
export function ModuleChips({
  groups,
  highlightedModules,
  ownedModules,
  consumedModules,
  selectedModule,
  onSelectModule,
}: ModuleChipsProps) {
  return (
    <div className="flex flex-col gap-2.5 px-2.5 py-2">
      {groups.map((group) => (
        <FolderGroup
          key={group.folder ?? ''}
          group={group}
          highlightedModules={highlightedModules}
          ownedModules={ownedModules}
          consumedModules={consumedModules}
          selectedModule={selectedModule}
          onSelectModule={onSelectModule}
        />
      ))}
    </div>
  );
}

function FolderGroup({
  group,
  onSelectModule,
  ...highlight
}: HighlightState & {
  group: ChipGroup;
  onSelectModule: (key: string | null) => void;
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
    <div className={cn('flex flex-col gap-1', groupDimmed && 'opacity-35')}>
      {group.folder && (
        <div className="truncate text-[10px] font-medium tracking-wide text-muted-foreground/60">
          {group.folder}/
        </div>
      )}
      <div className="flex flex-wrap items-start gap-1">
        {visible.map((chip) => (
          <ChipView
            key={chip.module.key}
            chip={chip}
            onSelectModule={onSelectModule}
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
            className="nodrag nopan rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            +{group.chips.length - GROUP_CHIP_CAP} more
          </button>
        )}
      </div>
    </div>
  );
}

function ChipView({
  chip,
  onSelectModule,
  ...highlight
}: HighlightState & {
  chip: ModuleChip;
  onSelectModule: (key: string | null) => void;
}) {
  const { highlightedModules, selectedModule } = highlight;

  if (chip.children.length === 0) {
    return (
      <LeafChip chip={chip} onSelectModule={onSelectModule} {...highlight} />
    );
  }

  const subtreeDimmed =
    highlightedModules !== null &&
    !chipKeys(chip).some((key) => highlightedModules.has(key));

  const inner = subtreeDimmed
    ? { ...highlight, highlightedModules: null }
    : highlight;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border border-border/60 bg-background/40 p-1',
        subtreeDimmed && 'opacity-35',
        selectedModule === chip.module.key && 'border-primary/50',
      )}
    >
      <LeafChip chip={chip} onSelectModule={onSelectModule} {...inner} />
      <div className="flex flex-wrap gap-1 pl-2">
        {chip.children.map((child) => (
          <ChipView
            key={child.module.key}
            chip={child}
            onSelectModule={onSelectModule}
            {...inner}
          />
        ))}
      </div>
    </div>
  );
}

function LeafChip({
  chip,
  highlightedModules,
  ownedModules,
  consumedModules,
  selectedModule,
  onSelectModule,
}: HighlightState & {
  chip: ModuleChip;
  onSelectModule: (key: string | null) => void;
}) {
  const key = chip.module.key;
  const isOwned = ownedModules?.has(key) ?? false;
  const isConsumed = !isOwned && (consumedModules?.has(key) ?? false);
  const isDimmed =
    highlightedModules !== null &&
    !highlightedModules.has(key) &&
    // Inside a parent card the container already dims the whole subtree.
    !chip.children.some((child) =>
      chipKeys(child).some((k) => highlightedModules.has(k)),
    );
  const isSelected = selectedModule === key;

  return (
    <button
      type="button"
      title={`${chip.module.layer} / ${chip.module.name || '(root)'}${
        chip.module.feature ? ` — ${chip.module.feature}` : ''
      } · ${chip.module.visibility}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelectModule(isSelected ? null : key);
      }}
      className={cn(
        'nodrag nopan flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors',
        'border-border/60 bg-muted/40 text-foreground/80 hover:border-border hover:bg-muted',
        isOwned &&
          'border-primary/60 bg-primary/15 text-primary hover:bg-primary/20',
        isConsumed &&
          'border-dashed border-sky-500/60 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300',
        isDimmed && 'opacity-35 hover:opacity-100',
        isSelected && 'ring-1 ring-primary/60',
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: VISIBILITY_COLOR[chip.module.visibility] }}
      />
      <span className="truncate">{chip.label}</span>
    </button>
  );
}
