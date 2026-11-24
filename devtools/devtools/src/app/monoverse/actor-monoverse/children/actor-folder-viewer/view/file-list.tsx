import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { scrollbarStyles } from '@kestack/web-platform/ui/components/scroll-styles';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from 'lucide-react';

import type { ChangeStatus } from '../../../../server/rpc/git/contract/index.js';
import {
  placesAmongSiblings,
  usePhone,
  useVirtualRows,
} from '../../../view/shared/index.js';
import type { FileTreeRow } from '../logic/shared/index.js';

/*
 * The folder's files, one row each, as a tree of their folders: drawn
 * only where the list shows, so a Package of a thousand files opens as
 * fast as a folder of ten. A folder opens and closes; a file shows, and
 * the file shown stays in sight however it was reached. The arrows move
 * through the rows, → and ← open and close a folder, and Tab lands on the
 * file shown, or the first row.
 */

const colour: Record<ChangeStatus, string> = {
  added: 'text-added',
  modified: 'text-changed',
  deleted: 'text-removed',
};

/** A row's height: a thumb's on a phone. */
const rowHeight = { wide: 26, phone: 30 };
/** Room above the first row and below the last. */
const inset = 6;

export function FileList({
  rows,
  shown,
  holders,
  faded,
  ignored,
  allOpenInside,
  onToggle,
  onShow,
  onToggleInside,
}: {
  rows: ReadonlyArray<FileTreeRow>;
  /** The file shown, by its path. */
  shown: string | null;
  /** The folders holding folders: each has a button opening or closing everything inside it. */
  holders: ReadonlySet<string>;
  /** Left unchanged by the branch, while the unchanged are dimmed. */
  faded: (row: FileTreeRow) => boolean;
  /** Outside the Package's Source roots. */
  ignored: (path: string) => boolean;
  /** Everything inside a folder is open. */
  allOpenInside: (path: string) => boolean;
  onToggle: (path: string) => void;
  onShow: (path: string) => void;
  onToggleInside: (path: string) => void;
}) {
  const scroller = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const height = usePhone() ? rowHeight.phone : rowHeight.wide;
  const indexOf = useMemo(() => {
    const at = new Map(rows.map(({ path }, index) => [path, index]));
    return (path: string | null) => (path === null ? undefined : at.get(path));
  }, [rows]);
  const among = useMemo(
    () => placesAmongSiblings(rows.map(({ depth }) => depth)),
    [rows],
  );

  // One row takes Tab: the file shown, else the first.
  const tabStop = indexOf(shown) ?? (rows.length === 0 ? undefined : 0);
  const [focused, setFocused] = useState<string | null>(null);
  const keyOf = useCallback(
    // A new height reads every row again.
    (index: number) => `${height}:${rows[index]?.path ?? index}`,
    [rows, height],
  );
  const drawn = useVirtualRows({
    count: rows.length,
    scroller,
    sizeOf: () => height,
    keyOf,
    offset: inset,
    keep: [indexOf(shown), tabStop, indexOf(focused)],
  });

  const rowAt = (index: number) =>
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`) ?? null;

  // The file shown stays in sight in the list, however it was reached.
  const { reach } = drawn;
  const shownAt = useRef(indexOf(shown));
  shownAt.current = indexOf(shown);
  useEffect(() => {
    const at = shownAt.current;
    if (at === undefined) return;
    reach(at, () => rowAt(at)?.scrollIntoView({ block: 'nearest' }));
  }, [shown, reach]);

  const focusRow = (index: number) =>
    reach(index, () => {
      const element = rowAt(index);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: 'nearest' });
    });

  const onKeyDown = (event: KeyboardEvent) => {
    const target = (event.target as Element).closest<HTMLElement>(
      '[data-index]',
    );
    if (target === null) return;
    const at = Number(target.dataset.index);
    const row = rows[at]!;
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(rows.length - 1, at + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, at - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = rows.length - 1;
        break;
      case 'ArrowRight':
        if (row.kind !== 'folder') return;
        if (row.open) next = at + 1;
        else onToggle(row.path);
        break;
      case 'ArrowLeft': {
        if (row.kind === 'folder' && row.open) {
          onToggle(row.path);
          break;
        }
        // To the folder holding it.
        const parent = rows
          .slice(0, at)
          .findLastIndex(
            (one) => one.kind === 'folder' && one.depth < row.depth,
          );
        if (parent !== -1) next = parent;
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    if (next === undefined || next === at) return;
    const to = rows[next]!;
    if (to.kind === 'file') onShow(to.path);
    focusRow(next);
  };

  return (
    <nav
      ref={scroller}
      aria-label="Files"
      className={cn('min-h-0 flex-1 overflow-y-auto', scrollbarStyles)}
      style={{ paddingBlock: inset }}
    >
      <ul
        ref={list}
        role="tree"
        aria-label="Files"
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const path = event.target
            .closest('[data-index]')
            ?.getAttribute('title');
          if (path !== null && path !== undefined) setFocused(path);
        }}
        className="relative"
        style={{ height: rows.length * height }}
      >
        {drawn.indices.map((index) => {
          const row = rows[index]!;
          return (
            <li
              key={row.path}
              role="presentation"
              className="group/row absolute inset-x-1.5"
              style={{ top: index * height, height }}
            >
              <Row
                trailing={holders.has(row.path)}
                row={row}
                index={index}
                among={among[index]!}
                selected={row.path === shown}
                faded={faded(row)}
                ignored={ignored(row.path)}
                focusable={index === tabStop}
                onPress={() =>
                  row.kind === 'folder' ? onToggle(row.path) : onShow(row.path)
                }
              />
              {holders.has(row.path) ? (
                <InsideToggle
                  name={row.kind === 'folder' ? row.label : ''}
                  open={allOpenInside(row.path)}
                  onToggle={() => onToggleInside(row.path)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Where a row's chevron starts, and how far in each level goes: the tree's. */
const gutter = 8;
const levelWidth = 16;

/**
 * One row of the list, drawn as the tree draws its own: a chevron, an
 * icon and a name in the colour of what changed, a hairline down the left
 * of each open folder's contents, and the file shown a band with a bar.
 * A folder opens and closes; a file shows.
 */
function Row({
  row,
  index,
  selected,
  faded,
  ignored,
  trailing,
  among,
  focusable,
  onPress,
}: {
  row: FileTreeRow;
  /** Its place among the rows beside it, for those who cannot see the rows not drawn. */
  among: { readonly position: number; readonly of: number };
  /** Room on the right for the button that opens or closes what is inside. */
  trailing: boolean;
  index: number;
  selected: boolean;
  /** Left unchanged by the branch, while the unchanged are dimmed. */
  faded: boolean;
  /** Outside the Package's Source roots. */
  ignored: boolean;
  focusable: boolean;
  onPress: () => void;
}) {
  const folder = row.kind === 'folder';
  const Icon = folder ? (row.open ? FolderOpenIcon : FolderIcon) : FileIcon;
  const toneClass = row.status === null ? null : colour[row.status];
  return (
    <button
      type="button"
      role="treeitem"
      aria-level={row.depth + 1}
      aria-posinset={among.position}
      aria-setsize={among.of}
      aria-expanded={folder ? row.open : undefined}
      aria-selected={folder ? undefined : selected}
      data-index={index}
      tabIndex={focusable ? 0 : -1}
      title={row.path}
      onClick={onPress}
      style={{ paddingLeft: gutter + row.depth * levelWidth }}
      className={cn(
        'relative flex h-full w-full min-w-0 items-center gap-1 rounded-md pr-2 text-left text-[13px] leading-none transition-colors duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/50',
        trailing && 'pr-8 max-sm:pr-9',
        faded && 'opacity-45 hover:opacity-80',
        selected
          ? 'bg-foreground/[0.1] dark:bg-foreground/[0.13]'
          : 'hover:bg-foreground/[0.035] active:bg-foreground/[0.06]',
      )}
    >
      {Array.from({ length: row.depth }, (_, level) => (
        <span
          key={level}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/[0.08]"
          style={{ left: gutter + level * levelWidth + 8 }}
        />
      ))}
      {selected ? (
        <span
          aria-hidden
          className="absolute inset-y-[5px] left-0 w-[3px] rounded-full bg-foreground"
        />
      ) : null}
      {folder ? (
        <ChevronRightIcon
          aria-hidden
          strokeWidth={2}
          className={cn(
            'size-3.5 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-150 motion-reduce:transition-none',
            row.open && 'rotate-90',
          )}
        />
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
      <Icon
        aria-hidden
        strokeWidth={1.5}
        className={cn(
          'ml-0.5 size-4 shrink-0',
          toneClass === null
            ? cn('text-muted-foreground', ignored ? 'opacity-50' : 'opacity-85')
            : cn(toneClass, 'opacity-70'),
        )}
      />
      <span
        className={cn(
          'ml-1.5 min-w-0 flex-1 truncate',
          toneClass === null
            ? ignored
              ? 'text-muted-foreground/80'
              : 'text-foreground/90'
            : cn(toneClass, ignored && 'opacity-75'),
          row.status === 'deleted' &&
            'line-through decoration-current/50 decoration-1',
        )}
      >
        {folder ? row.label : row.name}
      </span>
      {row.status === null ? null : (
        <span className="sr-only">, {row.status}</span>
      )}
    </button>
  );
}

/**
 * Beside a folder holding folders, on the right: one press opens
 * everything inside it, or, when all of it is open, closes every folder
 * inside it, the folder itself staying open. Shown on hover, or always on
 * a phone, where there is none.
 */
function InsideToggle({
  name,
  open,
  onToggle,
}: {
  name: string;
  /** Everything inside it is open. */
  open: boolean;
  onToggle: () => void;
}) {
  const label = open
    ? `Collapse everything in ${name}`
    : `Expand everything in ${name}`;
  const Icon = open ? ChevronsDownUpIcon : ChevronsUpDownIcon;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cn(
        'absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-[opacity,background-color] duration-150 outline-none max-sm:size-7',
        'hover:bg-foreground/[0.08] hover:text-foreground',
        'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 max-sm:opacity-70',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}
