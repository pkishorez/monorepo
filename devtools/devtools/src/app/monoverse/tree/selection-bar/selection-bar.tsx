import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  FileIcon,
  FolderGit2Icon,
  FolderIcon,
  PackageIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';

import type { Connection, TreeNode } from '../../model/index.js';

/*
 * What is selected, and what to do with it, in a bar docked
 * along the bottom of the tree: the only way in on a touch screen, where
 * a double tap is no double click, and the way that shows itself
 * everywhere else. With nothing selected it stands for the whole tree,
 * the repository or the Package, and can be viewed the same way. A
 * Package of the repository has a second button beside Open package: View
 * changes, what the branch changed in it, without going in. Its
 * counts are what the selection connects to, coloured as the tree draws
 * them, so it is the key to those colours too; the whole tree has none.
 */

export interface SelectionColours {
  readonly uses: string;
  readonly usedBy: string;
  readonly broken: string;
}

const iconOf = { folder: FolderIcon, file: FileIcon, package: PackageIcon };

/** The bar's one button, by what it stands for. */
export function selectionAction(
  node: Pick<TreeNode, 'kind'>,
  changesOn: boolean,
): string {
  if (node.kind === 'package') return 'Open package';
  if (node.kind === 'file') return 'Open file';
  return changesOn ? 'View changes' : 'Browse files';
}

export function SelectionBar({
  scope,
  node,
  root,
  changesOn,
  connections,
  colours,
  onActivate,
  onChanges,
  onClear,
}: {
  scope: 'repo' | 'package';
  /** What is selected, or the tree's root with nothing selected. */
  node: TreeNode;
  /** Nothing is selected: `node` is the whole tree. */
  root: boolean;
  /** Whether Changes is on: a folder is viewed for what changed in it. */
  changesOn: boolean;
  connections: ReadonlyMap<string, Connection>;
  colours: SelectionColours;
  /** Views it: a file in the viewer, a Package in its view, a folder in the folder viewer. */
  onActivate: () => void;
  /** Views what the branch changed in a Package, from the repository's tree. */
  onChanges?: (() => void) | undefined;
  onClear: () => void;
}) {
  let uses = 0;
  let usedBy = 0;
  let broken = 0;
  for (const connection of connections.values()) {
    uses += connection.uses;
    usedBy += connection.usedBy;
    broken += connection.broken;
  }
  const words =
    scope === 'repo'
      ? { uses: 'Depends on', usedBy: 'Used by' }
      : { uses: 'Uses', usedBy: 'Used by' };
  const action = selectionAction(node, changesOn);
  const Icon = root
    ? scope === 'repo'
      ? FolderGit2Icon
      : PackageIcon
    : iconOf[node.kind];
  const label = node.label ?? node.name;
  // Two buttons leave a phone room for the counts' colours, not their words.
  const compact = onChanges !== undefined;

  return (
    <div
      data-space-ignore
      role="region"
      aria-label="Selection"
      className={cn(
        // Phones: docked along the bottom of the tree.
        'absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-border/70 bg-background/95 py-2 pr-2 pl-4 backdrop-blur-md',
        'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        // Wider screens: one pill, centred at the bottom.
        'sm:right-auto sm:bottom-4 sm:left-1/2 sm:w-max sm:max-w-[min(48rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:gap-4 sm:rounded-xl sm:border-t-0 sm:py-1.5 sm:pr-1.5 sm:pl-4',
        'sm:shadow-[0_0_0_1px_var(--color-border),0_8px_24px_-8px_rgb(0_0_0/0.3),0_2px_6px_-2px_rgb(0_0_0/0.15)]',
      )}
    >
      <Icon
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
        <span
          className="min-w-0 truncate text-sm font-medium sm:max-w-80"
          title={node.path}
        >
          {label}
        </span>
        {root ? null : (
          <span className="flex min-w-0 items-center gap-3 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            <Count
              colour={colours.uses}
              label={words.uses}
              value={uses}
              compact={compact}
            />
            <Count
              colour={colours.usedBy}
              label={words.usedBy}
              value={usedBy}
              compact={compact}
            />
            {broken > 0 ? (
              <span
                className="flex items-center gap-1"
                style={{ color: colours.broken }}
              >
                <TriangleAlertIcon aria-hidden className="size-3.5" />
                {broken} broken
              </span>
            ) : null}
          </span>
        )}
      </div>
      {onChanges === undefined ? null : (
        <Button
          size="sm"
          variant="outline"
          className="h-9 shrink-0 px-3.5 max-sm:h-10 max-sm:px-3"
          onClick={onChanges}
        >
          <Short wide="View changes" narrow="Changes" />
        </Button>
      )}
      <Button
        size="sm"
        className="h-9 shrink-0 px-3.5 max-sm:h-10 max-sm:px-3"
        onClick={onActivate}
      >
        {onChanges === undefined ? (
          action
        ) : (
          <Short wide={action} narrow="Open" />
        )}
      </Button>
      {root ? null : (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Clear selection"
          className="size-9 shrink-0 text-muted-foreground max-sm:size-10"
          onClick={onClear}
        >
          <XIcon aria-hidden className="size-4" />
        </Button>
      )}
    </div>
  );
}

/** A button's words, shorter on a phone, where two buttons share the bar. */
function Short({ wide, narrow }: { wide: string; narrow: string }) {
  return (
    <>
      <span className="sm:hidden">{narrow}</span>
      <span className="max-sm:hidden">{wide}</span>
    </>
  );
}

function Count({
  colour,
  label,
  value,
  compact,
}: {
  colour: string;
  label: string;
  value: number;
  /** Its words for assistive technology only, on a phone. */
  compact: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <i
        aria-hidden
        className="block h-0.5 w-3 rounded-full"
        style={{ background: colour }}
      />
      <span className={compact ? 'max-sm:sr-only' : undefined}>{label}</span>{' '}
      <span className="text-foreground">{value}</span>
    </span>
  );
}
