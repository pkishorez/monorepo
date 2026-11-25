import { Button } from '@kestack/web-platform/ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  FileIcon,
  FolderGit2Icon,
  FolderIcon,
  PackageIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';

import type { TreeNode } from '../../logic/shared/index.js';
import type { Connection, Finding } from '../../logic/shared/index.js';

export interface SelectionColours {
  readonly uses: string;
  readonly usedBy: string;
  readonly broken: string;
}

const iconOf = { folder: FolderIcon, file: FileIcon, package: PackageIcon };

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
  findings,
  colours,
  onActivate,
  onChanges,
  onClear,
  panel = false,
}: {
  scope: 'repo' | 'package';
  node: TreeNode;
  root: boolean;
  changesOn: boolean;
  connections: ReadonlyMap<string, Connection>;
  findings: ReadonlyArray<Finding>;
  colours: SelectionColours;
  onActivate: () => void;
  onChanges?: (() => void) | undefined;
  onClear: () => void;
  panel?: boolean;
}) {
  let uses = 0;
  let usedBy = 0;
  for (const connection of connections.values()) {
    uses += connection.uses;
    usedBy += connection.usedBy;
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
  const compact = onChanges !== undefined && !panel;
  const counts = (
    <>
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
      {findings.length > 0 ? (
        <FindingList
          findings={findings}
          scope={scope}
          colour={colours.broken}
        />
      ) : null}
    </>
  );

  if (panel)
    return (
      <div
        role="region"
        aria-label="Selection"
        className="flex h-24 flex-col gap-2 px-1"
      >
        <div className="flex h-8 min-w-0 items-center gap-2 pl-1">
          {root ? (
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
              Nothing selected
            </span>
          ) : (
            <>
              <Icon
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium"
                title={node.path}
              >
                {label}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Clear selection"
                title="Clear selection"
                className="shrink-0 text-muted-foreground"
                onClick={onClear}
              >
                <XIcon aria-hidden className="size-3.5" />
              </Button>
            </>
          )}
        </div>
        <div className="flex h-4 min-w-0 items-center gap-x-3 overflow-hidden pl-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {root ? 'Click a row to see what it connects to.' : counts}
        </div>
        <div
          className={cn(
            'mt-auto grid gap-1.5',
            onChanges === undefined ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          <Button
            size="sm"
            variant={root ? 'outline' : 'default'}
            onClick={onActivate}
          >
            {root
              ? changesOn
                ? 'View all changes'
                : 'Browse all files'
              : onChanges === undefined
                ? action
                : 'Open'}
          </Button>
          {onChanges === undefined ? null : (
            <Button size="sm" variant="outline" onClick={onChanges}>
              View changes
            </Button>
          )}
        </div>
      </div>
    );

  return (
    <div
      data-space-ignore
      role="region"
      aria-label="Selection"
      className={cn(
        'absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-border/70 bg-background/95 py-2 pr-2 pl-4 backdrop-blur-md',
        'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
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
            {counts}
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

function FindingList({
  findings,
  scope,
  colour,
}: {
  findings: ReadonlyArray<Finding>;
  scope: 'repo' | 'package';
  colour: string;
}) {
  const count = findings.length;
  const word =
    scope === 'package' ? (count === 1 ? 'violation' : 'violations') : 'broken';
  return (
    <Popover>
      <PopoverTrigger
        className="-mx-1 flex h-5 items-center gap-1 rounded-md px-1 transition-colors duration-150 outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/50"
        style={{ color: colour }}
        aria-label={`${count} ${word}: show what is wrong`}
      >
        <TriangleAlertIcon aria-hidden className="size-3.5" />
        {count} {word}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="max-h-80 w-[min(28rem,calc(100vw-2rem))] gap-0 overflow-y-auto p-1"
      >
        <ul className="flex flex-col">
          {findings.map(({ message, where }, index) => (
            <li
              key={`${index}\0${where}`}
              className="flex flex-col gap-1 rounded-md px-2.5 py-2 text-xs"
            >
              <span className="leading-snug text-foreground">{message}</span>
              <span className="font-mono text-[11px] [overflow-wrap:anywhere] text-muted-foreground">
                {where}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

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
