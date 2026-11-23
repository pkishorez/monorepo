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
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  ArrowLeftIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  XIcon,
} from 'lucide-react';

import type { ChangeStatus } from '../contract/index.js';
import { FileViewerView } from '../file-viewer/index.js';
import { TreeSettings } from '../tree/index.js';
import {
  FolderViewerLive,
  defaultSettings,
  entriesOf,
  foldersOf,
  shownOf,
  stepFrom,
  stepsOf,
} from './actor.js';
import { fileTreeRows, type FileTreeRow } from './file-tree.js';
import { settle, Swipes, useRestAt } from './swipes.js';
import { isIgnored, isWithin } from '../model/index.js';
import { settingsTrigger, usePhone } from '../ui/index.js';

/*
 * A folder looked into: its files on the left, as a tree of their
 * folders, the one chosen on the right. On a phone the two take the whole
 * screen in turn. The list is drawn as the canvas draws its tree, by the
 * canvas's settings, behind the same sliders: a changed file's name takes
 * the colour of how it changed, a folder the colour its changes roll up
 * to, what the branch left unchanged is dimmed or left out, and so is an
 * ignored file.
 *
 * The file before or after the one shown is a step away: the bar under
 * it, a swipe across that bar, or ← and →; the file slides with the
 * finger, and the next one slides in from the side it came. On a phone
 * the list and the file sit side by side on one track, a screen each,
 * that slides under the finger from one to the other, and a back arrow
 * top left, or a swipe right, leaves the file for the list, and the list
 * for the canvas.
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

const plural = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? '' : 's'}`;

export const FolderViewerView = View.make(
  FolderViewerLive,
  ({ root, model, props, children, send }) => {
    const settings = props ?? defaultSettings;
    const entries = useMemo(
      () => entriesOf(model, settings),
      [model, settings],
    );
    const rows = useMemo(
      () => fileTreeRows(model.path, entries, new Set(model.closed)),
      [model.path, entries, model.closed],
    );
    const list = useRef<HTMLUListElement>(null);
    const changesOn = model.base !== null;
    const deletedCount = changesOn
      ? model.changed.filter(({ status }) => status === 'deleted').length
      : 0;
    const changedCount = entries.filter(({ status }) => status !== null).length;
    const order = useMemo(() => stepsOf(model, settings), [model, settings]);
    const shown = shownOf(model, settings);
    const at = shown === null ? -1 : order.indexOf(shown);
    const hasNext = stepFrom(model, settings, 1) !== null;
    const hasPrevious = stepFrom(model, settings, -1) !== null;
    const reduced = useReducedMotion() ?? false;

    // The folders holding folders: each has a button opening or closing
    // everything inside it.
    const holders = useMemo(() => {
      const folders = foldersOf(model, settings);
      return new Set(
        folders.filter((folder) =>
          folders.some((one) => one !== folder && isWithin(one, folder)),
        ),
      );
    }, [model, settings]);
    const closedSet = new Set(model.closed);
    const allOpenInside = (path: string) =>
      !closedSet.has(path) &&
      !model.closed.some((one) => one !== path && isWithin(one, path));
    const anyClosed = model.closed.length > 0;

    // The file shown slides with a swipe on the bar, and the next one in
    // from the side it came, fading as it goes.
    const fileX = useMotionValue(0);
    const fileOpacity = useTransform(fileX, [-200, 0, 200], [0.3, 1, 0.3]);
    const step = (by: number) => {
      if (stepFrom(model, settings, by) === null) return;
      send({ _tag: 'Stepped', by });
      if (reduced) return;
      fileX.set(by > 0 ? 56 : -56);
      animate(fileX, 0, settle);
    };

    // On a phone, the list and the file are a screen each on one track.
    const phone = usePhone();
    const selected = shown;
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
      if (shown === null) return;
      list.current
        ?.querySelector(`[title="${CSS.escape(shown)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }, [shown]);

    // One row takes Tab: the file shown, else the first.
    const tabStop =
      rows.find(({ path }) => path === shown)?.path ?? rows[0]?.path ?? null;

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
          'max-sm:h-auto max-sm:min-h-14 max-sm:gap-1 max-sm:pt-[env(safe-area-inset-top)] max-sm:pl-1.5',
        )}
      >
        {/* On a phone, back sits top left: out of the folder, to the canvas. */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close the folder"
          className="size-11 sm:hidden"
          onClick={() => send({ _tag: 'Closed' })}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col" title={model.title}>
          <span className="truncate font-mono text-xs font-medium">
            {model.title}
          </span>
          <span className="truncate text-[11px] text-muted-foreground tabular-nums">
            {changesOn
              ? `${plural(changedCount, 'file')} changed since ${model.base}`
              : plural(entries.length, 'file')}
            {changesOn && !settings.deleted && deletedCount > 0
              ? ` · ${deletedCount} deleted hidden`
              : null}
          </span>
        </div>
        {entries.length === 0 ? null : (
          <button
            type="button"
            aria-label={
              anyClosed ? 'Expand all folders' : 'Collapse all folders'
            }
            title={anyClosed ? 'Expand all folders' : 'Collapse all folders'}
            className={settingsTrigger}
            onClick={() => send({ _tag: 'AllToggled' })}
          >
            {anyClosed ? (
              <ChevronsUpDownIcon className="size-4" />
            ) : (
              <ChevronsDownUpIcon className="size-4" />
            )}
          </button>
        )}
        <TreeSettings
          changesOn={changesOn}
          unchanged={settings.unchanged}
          deleted={settings.deleted}
          ignored={settings.ignored}
          onUnchanged={(unchanged) =>
            send({ _tag: 'UnchangedChosen', unchanged })
          }
          onDeleted={() => send({ _tag: 'DeletedToggled' })}
          onIgnored={() => send({ _tag: 'IgnoredToggled' })}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close the folder"
          title="Close"
          className="max-sm:hidden"
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
              : deletedCount > 0 && !settings.deleted
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
                {...(phone
                  ? {
                      // Right: from the file to the list, and from the
                      // list out of the folder.
                      onRight: () =>
                        send({ _tag: model.showing ? 'Back' : 'Closed' }),
                    }
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
                        <li
                          key={row.path}
                          role="presentation"
                          className="group/row relative"
                        >
                          <Row
                            trailing={holders.has(row.path)}
                            row={row}
                            index={index}
                            selected={row.path === shown}
                            faded={
                              changesOn &&
                              settings.unchanged === 'dim' &&
                              row.status === null
                            }
                            ignored={isIgnored(row.path, model.sourceRoots)}
                            focusable={row.path === tabStop}
                            onPress={() =>
                              send(
                                row.kind === 'folder'
                                  ? { _tag: 'FolderToggled', path: row.path }
                                  : { _tag: 'Selected', path: row.path },
                              )
                            }
                          />
                          {holders.has(row.path) ? (
                            <InsideToggle
                              name={row.kind === 'folder' ? row.label : ''}
                              open={allOpenInside(row.path)}
                              onToggle={() =>
                                send({ _tag: 'InsideToggled', path: row.path })
                              }
                            />
                          ) : null}
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
                  {order.length > 1 || (order.length === 1 && at === -1) ? (
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
                        disabled={!hasPrevious}
                        className="max-sm:size-11"
                        onClick={() => step(-1)}
                      >
                        <ChevronLeftIcon className="size-4" />
                      </Button>
                      <Swipes
                        x={fileX}
                        follow={0.6}
                        {...(hasNext ? { onLeft: () => step(1) } : {})}
                        {...(hasPrevious ? { onRight: () => step(-1) } : {})}
                      />
                      <span className="min-w-0 flex-1 text-center text-[11px] text-muted-foreground tabular-nums">
                        {at === -1 ? '–' : at + 1} of {order.length}
                        {changesOn ? ' changed' : ''}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Next file"
                        title="Next file (→)"
                        disabled={!hasNext}
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

/** Where a row's chevron starts, and how far in each level goes: the canvas's. */
const gutter = 8;
const levelWidth = 16;

/**
 * One row of the list, drawn as the canvas draws its own: a chevron, an
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
  focusable,
  onPress,
}: {
  row: FileTreeRow;
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
      aria-expanded={folder ? row.open : undefined}
      aria-selected={folder ? undefined : selected}
      data-index={index}
      tabIndex={focusable ? 0 : -1}
      title={row.path}
      onClick={onPress}
      style={{ paddingLeft: gutter + row.depth * levelWidth }}
      className={cn(
        'relative flex h-[26px] w-full min-w-0 items-center gap-1 rounded-md pr-2 text-left text-[13px] leading-none transition-colors duration-150 outline-none max-sm:h-[30px]',
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
