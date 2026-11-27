import { memo, type MouseEvent } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  DoorOpenIcon,
  EyeIcon,
  FileDiffIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  LeafIcon,
  PackageIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import type { ChangeStatus } from '../../../../../logic/shared/index.js';
import type { TreeNode } from '../../logic/shared/index.js';
import { CheckMark } from '../../../../../view/shared/index.js';
import type { Connection, TreePackage } from '../../logic/shared/index.js';
import { gutter, indent } from './layout.js';

type Check = TreePackage['check'];

export interface OutlineRowActions {
  readonly press: (node: TreeNode) => void;
  readonly toggle: (path: string) => void;
  readonly activate: (node: TreeNode) => void;
  readonly reveal: (path: string) => void;
  readonly toggleInside: (path: string) => void;
  readonly open: (node: TreeNode) => void;
}

export type RowOpens = 'diff' | 'view';

const changeTone: Record<ChangeStatus, string> = {
  added: 'text-added',
  modified: 'text-changed',
  deleted: 'text-removed',
};

const filesIn = new WeakMap<TreeNode, number>();
function fileCount(node: TreeNode): number {
  if (node.kind === 'file') return 1;
  const known = filesIn.get(node);
  if (known !== undefined) return known;
  let count = 0;
  for (const child of node.children) count += fileCount(child);
  filesIn.set(node, count);
  return count;
}

const gone = (
  node: TreeNode,
  change: { readonly status: ChangeStatus; readonly count: number },
) =>
  change.status === 'deleted' &&
  (node.kind === 'file' ||
    (node.kind === 'folder' && change.count >= fileCount(node)));

const changeWord: Record<ChangeStatus, string> = {
  added: 'added',
  modified: 'modified',
  deleted: 'deleted',
};

interface Tone {
  readonly className: string;
  readonly struck: boolean;
  readonly plain: boolean;
}

function toneOf(
  node: TreeNode,
  change: { readonly status: ChangeStatus; readonly count: number } | null,
  ignored: boolean,
): Tone {
  if (change !== null)
    return {
      className: cn(changeTone[change.status], ignored && 'opacity-75'),
      struck: gone(node, change),
      plain: false,
    };
  return {
    className: ignored ? 'text-muted-foreground/80' : 'text-foreground/90',
    struck: false,
    plain: true,
  };
}

const tint = (colour: string, amount: number) =>
  `color-mix(in oklch, var(${colour}) ${amount}%, transparent)`;

const stop = (event: MouseEvent) => event.stopPropagation();

function linkOf(connection: Connection | null) {
  if (connection === null) return null;
  const { uses, usedBy, broken, excepted } = connection;
  if (broken > 0)
    return {
      bar: 'var(--outline-broken)',
      band: tint('--outline-broken', 10),
    };
  if (excepted > 0)
    return {
      bar: 'var(--outline-excepted)',
      band: tint('--outline-excepted', 10),
    };
  if (uses > 0 && usedBy > 0)
    return {
      bar: 'linear-gradient(var(--outline-uses) 50%, var(--outline-used-by) 50%)',
      band: `linear-gradient(90deg, ${tint('--outline-uses', 9)}, ${tint('--outline-used-by', 9)})`,
    };
  const colour = uses > 0 ? '--outline-uses' : '--outline-used-by';
  return {
    bar: `var(${colour})`,
    band: tint(colour, 9),
  };
}

export const OutlineRow = memo(function OutlineRow({
  node,
  depth,
  among,
  top,
  height,
  lead,
  width,
  open,
  selected,
  tabbable,
  ignored,
  dimmed,
  faded,
  connection,
  violations,
  excepted,
  leaf,
  cycle,
  check,
  change,
  inside,
  opens,
  actions,
}: {
  node: TreeNode;
  depth: number;
  among: { readonly position: number; readonly of: number };
  top: number;
  height: number;
  lead: number;
  width: number;
  open: boolean;
  selected: boolean;
  tabbable: boolean;
  ignored: boolean;
  dimmed: boolean;
  faded: boolean;
  connection: Connection | null;
  violations: number;
  excepted: number;
  leaf: boolean;
  cycle: boolean;
  check: Check | null;
  change: { readonly status: ChangeStatus; readonly count: number } | null;
  inside: boolean | null;
  opens: RowOpens;
  actions: OutlineRowActions;
}) {
  const isFolder = node.kind === 'folder';
  const revealing = isFolder && !open && connection !== null;
  const link = selected ? null : linkOf(connection);
  const tone = toneOf(node, change, ignored);

  return (
    <div
      data-row
      data-path={node.path}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={isFolder ? open : undefined}
      aria-level={depth + 1}
      aria-posinset={among.position}
      aria-setsize={among.of}
      tabIndex={tabbable ? 0 : -1}
      title={node.path}
      className={cn(
        'group/outline-row focus-ring absolute flex cursor-default items-center gap-1 rounded-md pr-2 text-[13px] leading-none transition-[opacity,filter] duration-200 ease-out motion-reduce:transition-none',
        dimmed
          ? 'opacity-25 grayscale hover:opacity-60'
          : faded && 'opacity-45 hover:opacity-80',
        selected
          ? 'bg-foreground/[0.1] dark:bg-foreground/[0.13]'
          : link === null
            ? 'hover:bg-foreground/[0.035] active:bg-foreground/[0.06]'
            : 'hover:shadow-[inset_0_0_0_1px_var(--color-border)]',
      )}
      style={{
        top,
        left: lead,
        width,
        height,
        paddingLeft: gutter + depth * indent,
        ...(link === null ? {} : { background: link.band }),
      }}
      onClick={(event) => {
        const secondClickOfDoubleClick = event.detail > 1;
        if (secondClickOfDoubleClick) return;
        actions.press(node);
      }}
      onDoubleClick={() => actions.activate(node)}
      onContextMenu={
        isFolder
          ? (event) => {
              event.preventDefault();
              if (inside === null) actions.toggle(node.path);
              else actions.toggleInside(node.path);
            }
          : undefined
      }
    >
      {selected || link !== null ? (
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-[5px] left-0 w-[3px] rounded-full',
            selected && 'bg-foreground',
          )}
          style={link === null ? undefined : { background: link.bar }}
        />
      ) : null}
      {isFolder ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? `Close ${node.name}` : `Open ${node.name}`}
          className="relative flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors duration-100 before:absolute before:-inset-1 hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            actions.toggle(node.path);
          }}
          onDoubleClick={stop}
        >
          <ChevronRightIcon
            strokeWidth={2}
            className={cn(
              'size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
        </button>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <Glyph node={node} open={open} ignored={ignored} tone={tone} />
      <Name node={node} tone={tone} />
      {leaf ? <LeafMark /> : null}
      {change === null ? null : (
        <span className="sr-only">, {changeWord[change.status]}</span>
      )}
      {revealing ||
      marked(violations, excepted, cycle, check) ||
      inside !== null ||
      hover ? (
        <span className="ml-auto flex shrink-0 items-center gap-2.5 pl-2">
          {revealing ? (
            <RevealChip node={node} connection={connection} actions={actions} />
          ) : null}
          <Findings
            node={node}
            violations={violations}
            excepted={excepted}
            cycle={cycle}
            check={check}
          />
          {inside === null ? null : (
            <InsideToggle
              node={node}
              open={inside}
              shown={selected}
              actions={actions}
            />
          )}
          <span className="flex size-5 shrink-0 items-center justify-center [@media(hover:none)]:hidden">
            <OpenButton
              node={node}
              opens={opens}
              shown={selected}
              actions={actions}
            />
          </span>
        </span>
      ) : null}
    </div>
  );
});

const hover = globalThis.matchMedia?.('(hover: hover)').matches ?? true;

function OpenButton({
  node,
  opens,
  shown,
  actions,
}: {
  node: TreeNode;
  opens: RowOpens;
  shown: boolean;
  actions: OutlineRowActions;
}) {
  const label =
    opens === 'diff'
      ? `View changes in ${node.label ?? node.name}`
      : node.kind === 'file'
        ? `Open ${node.name}`
        : `Browse files in ${node.name}`;
  const Icon = opens === 'diff' ? FileDiffIcon : EyeIcon;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      className={cn(
        'relative flex size-5 items-center justify-center rounded-md text-muted-foreground transition-[opacity,background-color] duration-150 before:absolute before:-inset-1 hover:bg-foreground/[0.08] hover:text-foreground',
        shown
          ? 'opacity-100'
          : 'opacity-0 group-hover/outline-row:opacity-100 focus-visible:opacity-100',
      )}
      onClick={(event) => {
        event.stopPropagation();
        actions.open(node);
      }}
      onDoubleClick={stop}
    >
      <Icon strokeWidth={2} className="size-3.5" />
    </button>
  );
}

function Glyph({
  node,
  open,
  ignored,
  tone,
}: {
  node: TreeNode;
  open: boolean;
  ignored: boolean;
  tone: Tone;
}) {
  const Icon =
    node.kind === 'package'
      ? PackageIcon
      : node.kind === 'folder'
        ? open
          ? FolderOpenIcon
          : FolderIcon
        : FileIcon;
  return (
    <Icon
      aria-hidden
      strokeWidth={1.5}
      className={cn(
        'ml-0.5 size-4 shrink-0',
        tone.plain
          ? cn('text-muted-foreground', ignored ? 'opacity-50' : 'opacity-85')
          : cn(tone.className, 'opacity-70'),
      )}
    />
  );
}

function Name({ node, tone }: { node: TreeNode; tone: Tone }) {
  const strike =
    tone.struck && 'line-through decoration-1 decoration-current/50';
  if (node.kind === 'package') {
    const label = node.label ?? node.name;
    return (
      <span className="ml-1.5 flex min-w-0 flex-col gap-[3px]">
        <span
          className={cn(
            'min-w-0 truncate font-medium',
            tone.plain ? 'text-foreground' : tone.className,
            strike,
          )}
        >
          {node.name}
        </span>
        <span className="flex min-w-0 items-baseline gap-1.5 text-[11.5px] leading-none text-muted-foreground">
          {label !== node.name || node.version === undefined ? (
            <span className="min-w-0 truncate">{label}</span>
          ) : null}
          {node.version === undefined ? null : (
            <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/70 tabular-nums">
              {node.version}
            </span>
          )}
        </span>
      </span>
    );
  }
  return (
    <span className={cn('ml-1.5 min-w-0 truncate', tone.className, strike)}>
      {node.name}
    </span>
  );
}

function InsideToggle({
  node,
  open,
  shown,
  actions,
}: {
  node: TreeNode;
  open: boolean;
  shown: boolean;
  actions: OutlineRowActions;
}) {
  const label = open
    ? `Collapse everything in ${node.name}`
    : `Expand everything in ${node.name}`;
  const Icon = open ? ChevronsDownUpIcon : ChevronsUpDownIcon;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      className={cn(
        'relative -my-1 flex size-5 items-center justify-center rounded-md text-muted-foreground transition-[opacity,background-color] duration-150 before:absolute before:-inset-1 hover:bg-foreground/[0.08] hover:text-foreground',
        shown
          ? 'opacity-100'
          : 'opacity-0 group-hover/outline-row:opacity-100 focus-visible:opacity-100 max-sm:opacity-60',
      )}
      onClick={(event) => {
        event.stopPropagation();
        actions.toggleInside(node.path);
      }}
      onDoubleClick={stop}
    >
      <Icon strokeWidth={2} className="size-3.5" />
    </button>
  );
}

const marked = (
  violations: number,
  excepted: number,
  cycle: boolean,
  check: Check | null,
) =>
  violations > 0 ||
  excepted > 0 ||
  cycle ||
  (check !== null && check._tag !== 'Unchecked');

const leafLabel = 'Leaf: other folders import it, and it imports none';

function LeafMark() {
  return (
    <span
      role="img"
      aria-label={leafLabel}
      title={leafLabel}
      className="ml-1.5 flex shrink-0"
    >
      <LeafIcon strokeWidth={2} className="size-3 text-(--outline-leaf)" />
    </span>
  );
}

function ExceptedCount({ node, count }: { node: TreeNode; count: number }) {
  const label =
    node.kind === 'file'
      ? plural(
          count,
          'import in this file goes through a door or an exception',
          'imports in this file go through a door or an exception',
        )
      : plural(
          count,
          'import inside goes through a door or an exception',
          'imports inside go through a door or an exception',
        );
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="flex items-center gap-0.5 text-[11px] font-medium text-(--outline-excepted) tabular-nums"
    >
      <DoorOpenIcon strokeWidth={2} className="size-3.5" />
      {count}
    </span>
  );
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function Findings({
  node,
  violations,
  excepted,
  cycle,
  check,
}: {
  node: TreeNode;
  violations: number;
  excepted: number;
  cycle: boolean;
  check: Check | null;
}) {
  const exceptedMark =
    excepted > 0 ? <ExceptedCount node={node} count={excepted} /> : null;
  const cycleMark = cycle ? (
    <span
      role="img"
      aria-label={
        node.kind === 'package' ? 'In a Package cycle' : 'Holds a Package cycle'
      }
      title={
        node.kind === 'package' ? 'In a Package cycle' : 'Holds a Package cycle'
      }
      className="flex"
    >
      <TriangleAlertIcon
        strokeWidth={2}
        className="size-3.5 text-(--outline-broken)"
      />
    </span>
  ) : null;
  if (node.kind === 'package')
    return (
      <>
        {exceptedMark}
        <CheckMark check={check ?? undefined} />
        {cycleMark}
      </>
    );
  if (violations === 0)
    return (
      <>
        {exceptedMark}
        {cycleMark}
      </>
    );
  const label =
    node.kind === 'file'
      ? plural(violations, 'Violation in this file', 'Violations in this file')
      : plural(
          violations,
          'Violation in the files inside',
          'Violations in the files inside',
        );
  return (
    <>
      {exceptedMark}
      <span
        role="img"
        aria-label={label}
        title={label}
        className="flex items-center gap-0.5 text-[11px] font-medium text-(--outline-broken) tabular-nums"
      >
        <TriangleAlertIcon strokeWidth={2} className="size-3.5" />
        {violations}
      </span>
      {cycleMark}
    </>
  );
}

function RevealChip({
  node,
  connection,
  actions,
}: {
  node: TreeNode;
  connection: Connection | null;
  actions: OutlineRowActions;
}) {
  if (connection === null) return null;
  const { uses, usedBy, broken, excepted } = connection;
  const parts = [
    uses > 0 ? `uses ${uses}` : null,
    usedBy > 0 ? `used by ${usedBy}` : null,
    broken > 0 ? `${broken} broken` : null,
    excepted > 0 ? `${excepted} through a door or an exception` : null,
  ].filter((part) => part !== null);
  const label = `Open ${node.name} to what is connected inside: ${parts.join(', ')}`;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      className={cn(
        'relative -mx-1 flex h-5 items-center gap-1.5 rounded-md px-1 text-[11px] font-medium tabular-nums transition-[background-color] duration-150 ease-out before:absolute before:-inset-y-1 hover:bg-foreground/[0.06]',
      )}
      onClick={(event) => {
        event.stopPropagation();
        actions.reveal(node.path);
      }}
      onDoubleClick={stop}
    >
      {uses > 0 ? (
        <span className="flex items-center gap-px text-(--outline-uses)">
          <ArrowUpRightIcon strokeWidth={2.25} className="size-3" />
          {uses}
        </span>
      ) : null}
      {usedBy > 0 ? (
        <span className="flex items-center gap-px text-(--outline-used-by)">
          <ArrowDownLeftIcon strokeWidth={2.25} className="size-3" />
          {usedBy}
        </span>
      ) : null}
    </button>
  );
}
