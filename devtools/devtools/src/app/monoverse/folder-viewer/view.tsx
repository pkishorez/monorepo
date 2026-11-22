import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { scrollbarStyles } from '@kestack/web-platform/ui/components/scroll-styles';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { GestureProvider, GestureZone } from '@kestack/web-platform/ui/input';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';

import type { ChangeStatus } from '../contract/index.js';
import { FileViewerView, ViewOptions } from '../file-viewer/index.js';
import { FolderViewerLive, entriesOf, filesInOrder } from './actor.js';
import { fileTreeRows, type FileTreeRow } from './file-tree.js';
import { settle, Swipes, useRestAt } from './swipes.js';
import { usePhone } from '../ui/index.js';

/*
 * A folder looked into: its files on the left, as a tree of their
 * folders, the one chosen on the right. On a phone the two take the whole
 * screen in turn. A changed file's name takes the colour of how it
 * changed, with one quiet letter beside it, and a folder the colour its
 * changes roll up to; nothing more.
 *
 * The file before or after the one shown is a step away: the bar under
 * it, a swipe across that bar, or ← and →; the file slides with the
 * finger, and the next one slides in from the side it came. On a phone
 * the list and the file sit side by side on one track, a screen each,
 * that slides under the finger from one to the other. How a diff reads,
 * and whether the deleted files are listed, sit in one menu.
 */

/** Keys typed into a field are its own. */
const typing = (target: EventTarget) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA');

const colour: Record<ChangeStatus, string> = {
  added: 'text-added',
  modified: 'text-changed',
  deleted: 'text-removed',
};
/** A name takes its colour, and a deleted one is struck through. */
const tone: Record<ChangeStatus, string> = {
  ...colour,
  deleted: 'text-removed line-through decoration-1',
};
const letter: Record<ChangeStatus, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
};

const plural = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? '' : 's'}`;

/** How far in a row starts, by its depth. */
const indent = (depth: number) => ({
  paddingLeft: `${0.5 + depth * 0.875}rem`,
});

export const FolderViewerView = View.make(
  FolderViewerLive,
  ({ root, model, children, send }) => {
    const entries = useMemo(() => entriesOf(model), [model]);
    const rows = useMemo(
      () => fileTreeRows(model.path, entries, new Set(model.closed)),
      [model.path, entries, model.closed],
    );
    const list = useRef<HTMLUListElement>(null);
    const changesOn = model.base !== null;
    const deletedCount = changesOn
      ? model.changed.filter(({ status }) => status === 'deleted').length
      : 0;
    const order = useMemo(() => filesInOrder(model), [model]);
    const at = model.selected === null ? -1 : order.indexOf(model.selected);
    const reduced = useReducedMotion() ?? false;

    // The file shown slides with a swipe on the bar, and the next one in
    // from the side it came, fading as it goes.
    const fileX = useMotionValue(0);
    const fileOpacity = useTransform(fileX, [-200, 0, 200], [0.3, 1, 0.3]);
    const step = (by: number) => {
      const to = at + by;
      if (at === -1 || to < 0 || to >= order.length) return;
      send({ _tag: 'Stepped', by });
      if (reduced) return;
      fileX.set(by > 0 ? 56 : -56);
      animate(fileX, 0, settle);
    };

    // On a phone, the list and the file are a screen each on one track.
    const phone = usePhone();
    const selected = model.selected;
    const [width, setWidth] = useState(0);
    const observer = useRef<ResizeObserver | null>(null);
    const measure = useCallback((element: HTMLDivElement | null) => {
      observer.current?.disconnect();
      if (element === null) return;
      observer.current = new ResizeObserver(([entry]) =>
        setWidth(entry?.contentRect.width ?? 0),
      );
      observer.current.observe(element);
    }, []);
    const trackX = useMotionValue(0);
    const rest = phone && model.showing ? -width : 0;
    useRestAt(trackX, rest);
    // ← and → step anywhere but the list, whose arrows open and close folders.
    const onStepKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (typing(event.target)) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="tree"], [role="menu"]') !== null
      )
        return;
      event.preventDefault();
      step(event.key === 'ArrowLeft' ? -1 : 1);
    };

    // The file shown stays in sight in the list, however it was reached.
    useEffect(() => {
      if (model.selected === null) return;
      list.current
        ?.querySelector(`[title="${CSS.escape(model.selected)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }, [model.selected]);

    // One row takes Tab: the file shown, else the first.
    const tabStop =
      rows.find(({ path }) => path === model.selected)?.path ??
      rows[0]?.path ??
      null;

    const focusRow = (index: number) =>
      list.current
        ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
        ?.focus();

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
          else send({ _tag: 'FolderToggled', path: row.path });
          break;
        case 'ArrowLeft': {
          if (row.kind === 'folder' && row.open) {
            send({ _tag: 'FolderToggled', path: row.path });
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
      if (to.kind === 'file') send({ _tag: 'Selected', path: to.path });
      focusRow(next);
    };

    const header = (
      <header
        className={cn(
          'flex h-11 shrink-0 items-center gap-3 border-b border-border/60 pr-1.5 pl-3',
          'max-sm:h-auto max-sm:min-h-14 max-sm:pt-[env(safe-area-inset-top)]',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col" title={model.title}>
          <span className="truncate font-mono text-xs font-medium">
            {model.title}
          </span>
          <span className="truncate text-[11px] text-muted-foreground tabular-nums">
            {changesOn
              ? `${plural(entries.length, 'file')} changed since ${model.base}`
              : plural(entries.length, 'file')}
            {changesOn && !model.deleted && deletedCount > 0
              ? ` · ${deletedCount} deleted hidden`
              : null}
          </span>
        </div>
        <ViewOptions
          diff={changesOn}
          {...(deletedCount > 0
            ? {
                deleted: {
                  shown: model.deleted,
                  onToggle: () => send({ _tag: 'DeletedToggled' }),
                },
              }
            : {})}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close the folder"
          title="Close"
          className="max-sm:size-11"
          onClick={() => send({ _tag: 'Closed' })}
        >
          <XIcon className="size-4" />
        </Button>
      </header>
    );

    return (
      <section
        {...root}
        aria-label={`Folder ${model.title}`}
        className="flex h-full min-h-0 flex-col bg-background"
        onKeyDown={onStepKey}
      >
        {/* On a phone the list's screen carries it, so it slides with the list. */}
        {phone && entries.length > 0 ? null : header}
        {entries.length === 0 ? (
          <p className="flex flex-1 items-center justify-center p-8 text-center text-sm text-balance text-muted-foreground">
            {!changesOn
              ? `No files in ${model.title}.`
              : deletedCount > 0 && !model.deleted
                ? `Only deleted files changed in ${model.title} since ${model.base}.`
                : `Nothing changed in ${model.title} since ${model.base}.`}
          </p>
        ) : (
          <GestureProvider>
            <GestureZone
              ref={measure}
              className="flex min-h-0 flex-1 overflow-hidden"
            >
              <Swipes
                x={trackX}
                rest={rest}
                {...(phone && !model.showing && selected !== null
                  ? { onLeft: () => send({ _tag: 'Selected', path: selected }) }
                  : {})}
                {...(phone && model.showing
                  ? { onRight: () => send({ _tag: 'Back' }) }
                  : {})}
              />
              <motion.div
                className="flex min-h-0 min-w-0 flex-1 max-sm:w-[200%] max-sm:flex-none"
                style={phone ? { x: trackX } : undefined}
              >
                <div
                  inert={phone && model.showing}
                  className="flex min-h-0 w-72 shrink-0 flex-col border-r border-border/60 max-sm:w-1/2 max-sm:border-r-0"
                >
                  {phone ? header : null}
                  <nav
                    aria-label="Files"
                    className={cn(
                      'min-h-0 flex-1 overflow-y-auto py-1.5',
                      scrollbarStyles,
                    )}
                  >
                    <ul
                      ref={list}
                      role="tree"
                      aria-label="Files"
                      onKeyDown={onKeyDown}
                      className="flex flex-col px-1.5"
                    >
                      {rows.map((row, index) => (
                        <li key={row.path} role="presentation">
                          <Row
                            row={row}
                            index={index}
                            selected={row.path === model.selected}
                            focusable={row.path === tabStop}
                            onPress={() =>
                              send(
                                row.kind === 'folder'
                                  ? { _tag: 'FolderToggled', path: row.path }
                                  : { _tag: 'Selected', path: row.path },
                              )
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </nav>
                </div>
                <div
                  inert={phone && !model.showing}
                  className="flex min-h-0 min-w-0 flex-1 flex-col bg-background max-sm:w-1/2 max-sm:flex-none max-sm:shadow-[-12px_0_24px_-16px_rgb(0_0_0/0.6)]"
                >
                  <motion.div
                    className="min-h-0 flex-1"
                    style={{ x: fileX, opacity: fileOpacity }}
                  >
                    {children.file === undefined ? null : (
                      <FileViewerView instance={children.file} />
                    )}
                  </motion.div>
                  {order.length > 1 ? (
                    <GestureZone
                      role="group"
                      aria-label="Step between files"
                      className="flex h-10 shrink-0 items-center gap-1 border-t border-border/60 px-1.5 select-none max-sm:h-auto max-sm:min-h-12 max-sm:pb-[env(safe-area-inset-bottom)]"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Previous file"
                        title="Previous file (←)"
                        disabled={at <= 0}
                        className="max-sm:size-11"
                        onClick={() => step(-1)}
                      >
                        <ChevronLeftIcon className="size-4" />
                      </Button>
                      <Swipes
                        x={fileX}
                        follow={0.6}
                        {...(at < order.length - 1 && at !== -1
                          ? { onLeft: () => step(1) }
                          : {})}
                        {...(at > 0 ? { onRight: () => step(-1) } : {})}
                      />
                      <span className="min-w-0 flex-1 text-center text-[11px] text-muted-foreground tabular-nums">
                        {at + 1} of {order.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Next file"
                        title="Next file (→)"
                        disabled={at === -1 || at >= order.length - 1}
                        className="max-sm:size-11"
                        onClick={() => step(1)}
                      >
                        <ChevronRightIcon className="size-4" />
                      </Button>
                    </GestureZone>
                  ) : null}
                </div>
              </motion.div>
            </GestureZone>
          </GestureProvider>
        )}
      </section>
    );
  },
);

/** One row of the list: a folder, which opens and closes, or a file, which shows. */
function Row({
  row,
  index,
  selected,
  focusable,
  onPress,
}: {
  row: FileTreeRow;
  index: number;
  selected: boolean;
  focusable: boolean;
  onPress: () => void;
}) {
  const folder = row.kind === 'folder';
  return (
    <button
      type="button"
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={folder ? row.open : undefined}
      aria-selected={folder ? undefined : selected}
      data-index={index}
      tabIndex={focusable ? 0 : -1}
      title={row.path}
      onClick={onPress}
      style={indent(row.depth)}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 rounded-md py-1 pr-2.5 text-left text-[13px] transition-colors duration-150 outline-none',
        'hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50',
        'max-sm:min-h-11',
        selected && 'bg-muted sm:hover:bg-muted',
      )}
    >
      {folder ? (
        <ChevronRightIcon
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150',
            row.open && 'rotate-90',
          )}
        />
      ) : (
        <span aria-hidden className="w-3.5 shrink-0" />
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          folder
            ? row.status === null
              ? 'text-muted-foreground'
              : colour[row.status]
            : row.status === null
              ? null
              : tone[row.status],
        )}
      >
        {folder ? row.label : row.name}
      </span>
      {folder || row.status === null ? null : (
        <span
          aria-label={row.status}
          className={cn(
            'shrink-0 font-mono text-[10.5px] opacity-70',
            colour[row.status],
          )}
        >
          {letter[row.status]}
        </span>
      )}
    </button>
  );
}
