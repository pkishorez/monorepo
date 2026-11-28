import { memo, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CornerRightUpIcon,
  DoorOpenIcon,
  EyeIcon,
  FileDiffIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  LeafIcon,
  PackageIcon,
  RepeatIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import type { ChangeStatus } from '../../../../../logic/shared/index.js';
import type { TreeNode } from '../../logic/shared/index.js';
import { CheckMark } from '../../../../../view/shared/index.js';
import type {
  Connection,
  Reached,
  TreePackage,
} from '../../logic/shared/index.js';
import { canHover, gutter, indent } from './layout.js';

type Check = TreePackage['check'];

export interface OutlineRowActions {
  readonly press: (node: TreeNode) => void;
  readonly toggle: (path: string) => void;
  readonly activate: (node: TreeNode) => void;
  readonly reveal: (path: string) => void;
  readonly toggleInside: (path: string) => void;
  readonly unfold: (path: string) => void;
  readonly open: (node: TreeNode) => void;
}

export type RowOpens = 'diff' | 'view';

export interface MarkColumns {
  readonly problems: boolean;
  readonly shape: boolean;
}

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

const wash = (colour: string) => `linear-gradient(${colour}, ${colour})`;

const selectedWash = wash('var(--outline-selected)');

const stop = (event: MouseEvent) => event.stopPropagation();

function linkOf(connection: Connection | null) {
  if (connection === null) return null;
  const { uses, usedBy, broken } = connection;
  if (broken > 0)
    return {
      bar: 'var(--outline-broken)',
      band: wash(tint('--outline-broken', 10)),
    };
  if (uses > 0 && usedBy > 0)
    return {
      bar: 'linear-gradient(var(--outline-uses) 50%, var(--outline-used-by) 50%)',
      band: `linear-gradient(90deg, ${tint('--outline-uses', 9)}, ${tint('--outline-used-by', 9)})`,
    };
  const colour = uses > 0 ? '--outline-uses' : '--outline-used-by';
  return {
    bar: `var(${colour})`,
    band: wash(tint(colour, 9)),
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
  leaf,
  reach,
  door,
  columns,
  wide,
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
  leaf: boolean;
  reach: ReadonlyArray<Reached> | null;
  door: number | null;
  columns: MarkColumns;
  wide: boolean;
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
  const pinned =
    selected ||
    revealing ||
    violations > 0 ||
    cycle ||
    door !== null ||
    reach !== null ||
    (check !== null && check._tag !== 'Unchecked');

  return (
    <div
      data-row
      data-path={node.path}
      data-linked={link === null ? undefined : ''}
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
          ? 'bg-(--outline-selected)'
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
              else actions.unfold(node.path);
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
      <Glyph node={node} open={open} ignored={ignored} leaf={leaf} />
      <Name node={node} tone={tone} />
      {change === null ? null : (
        <span className="sr-only">, {changeWord[change.status]}</span>
      )}
      <span
        className={cn(
          'ml-auto flex shrink-0 items-center gap-2 pl-2',
          wide &&
            (pinned
              ? 'sticky right-0 bg-background'
              : 'group-hover/outline-row:sticky group-hover/outline-row:right-0 group-hover/outline-row:bg-background'),
        )}
        style={
          wide
            ? {
                backgroundImage: selected
                  ? selectedWash
                  : (link?.band ?? 'none'),
              }
            : undefined
        }
      >
        {revealing ? (
          <RevealChip node={node} connection={connection} actions={actions} />
        ) : null}
        {columns.problems ? (
          <MarkColumn>
            <Problems
              node={node}
              violations={violations}
              cycle={cycle}
              check={check}
            />
          </MarkColumn>
        ) : null}
        {columns.shape ? (
          <MarkColumn>
            {door === null ? null : <DoorMark count={door} />}
            {reach === null ? null : <ReachMark node={node} reach={reach} />}
          </MarkColumn>
        ) : null}
        {canHover || selected ? (
          <span className="flex w-11 shrink-0 items-center justify-end gap-1 [@media(hover:none)]:w-14">
            {inside === null ? null : (
              <InsideToggle
                node={node}
                open={inside}
                shown={selected}
                actions={actions}
              />
            )}
            <OpenButton
              node={node}
              opens={opens}
              shown={selected}
              actions={actions}
            />
          </span>
        ) : null}
      </span>
    </div>
  );
});

const rowButton =
  'relative flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[opacity,background-color] duration-150 before:absolute before:-inset-1 hover:bg-foreground/[0.08] hover:text-foreground [@media(hover:none)]:size-6 [@media(hover:none)]:before:-inset-2';

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
        rowButton,
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

const leafLabel = 'Leaf: nothing inside it imports anything outside it';

function Glyph({
  node,
  open,
  ignored,
  leaf,
}: {
  node: TreeNode;
  open: boolean;
  ignored: boolean;
  leaf: boolean;
}) {
  if (leaf)
    return (
      <span title={leafLabel} className="ml-0.5 flex shrink-0">
        <LeafIcon
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            'size-4 text-(--outline-leaf)',
            ignored && 'opacity-50',
          )}
        />
        <span className="sr-only">{leafLabel}</span>
      </span>
    );
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
        'ml-0.5 size-4 shrink-0 text-muted-foreground',
        ignored ? 'opacity-50' : 'opacity-85',
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
        rowButton,
        shown
          ? 'opacity-100'
          : 'opacity-0 group-hover/outline-row:opacity-100 focus-visible:opacity-100',
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

function MarkColumn({ children }: { children: ReactNode }) {
  return (
    <span className="flex min-w-9 items-center justify-end gap-2">
      {children}
    </span>
  );
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function Problems({
  node,
  violations,
  cycle,
  check,
}: {
  node: TreeNode;
  violations: number;
  cycle: boolean;
  check: Check | null;
}) {
  const cycleLabel =
    node.kind === 'package' ? 'In a Package cycle' : 'Holds a Package cycle';
  const cycleMark = cycle ? (
    <span
      role="img"
      aria-label={cycleLabel}
      title={cycleLabel}
      className="flex"
    >
      <RepeatIcon
        strokeWidth={2}
        className="size-3.5 text-(--outline-broken)"
      />
    </span>
  ) : null;
  if (node.kind === 'package')
    return (
      <>
        <CheckMark check={check ?? undefined} />
        {cycleMark}
      </>
    );
  if (violations === 0) return cycleMark;
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

function DoorMark({ count }: { count: number }) {
  const label =
    count === 0
      ? 'Door: nothing beside or below it imports it'
      : plural(
          count,
          'folder beside or below imports this door',
          'folders beside or below import this door',
        );
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground tabular-nums',
        count === 0 && 'opacity-45',
      )}
    >
      <DoorOpenIcon strokeWidth={2} className="size-3.5" />
      {count}
    </span>
  );
}

const reachWord: Record<Reached['by'], string> = {
  violation: 'a violation',
  exception: 'an exception',
  door: 'a door',
  module: 'its own module',
};

const besideIt = (from: string, to: string) => {
  const own = from.split('/');
  const far = to.split('/');
  let shared = 0;
  while (shared < own.length && own[shared] === far[shared]) shared += 1;
  return far.slice(shared).join('/') || to;
};

function ReachMark({
  node,
  reach,
}: {
  node: TreeNode;
  reach: ReadonlyArray<Reached>;
}) {
  const bent = reach.some(({ by }) => by === 'exception');
  const label = `${plural(
    reach.length,
    'folder outside it is imported',
    'folders outside it are imported',
  )}: ${reach
    .map(
      ({ folder, by }) => `${besideIt(node.path, folder)} (${reachWord[by]})`,
    )
    .join(', ')}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
        bent ? 'text-(--outline-excepted)' : 'text-muted-foreground',
      )}
    >
      <CornerRightUpIcon strokeWidth={2} className="size-3.5" />
      {reach.length}
    </span>
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
