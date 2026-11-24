import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { GestureProvider, GestureZone } from '@kestack/web-platform/ui/input';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  XIcon,
} from 'lucide-react';

import { isWithin } from '../../../../../../server/rpc/contract/index.js';
import { isIgnored } from '../../../logic/shared/index.js';
import {
  settingsTrigger,
  TreeSettings,
  usePhone,
} from '../../../view/shared/index.js';
import {
  defaultSettings,
  entriesOf,
  fileTreeRows,
  foldersOf,
  shownOf,
  stepFrom,
  stepsOf,
  type ViewerShape,
} from '../logic/shared/index.js';
import { FileList } from './file-list.js';
import { settle, Swipes, useRestAt } from './swipes.js';

/*
 * A folder looked into: its files on the left, as a tree of their
 * folders, the one chosen on the right. On a phone the two take the whole
 * screen in turn. The list is drawn as the tree is drawn, by the
 * tree's settings, behind the same sliders: a changed file's name takes
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
 * for the tree.
 */

/** Keys typed into a field are its own. */
const typing = (target: EventTarget) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA');

const plural = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? '' : 's'}`;

type FolderProps = Extract<
  ViewPropsOf<typeof ViewerShape>,
  { readonly _tag: 'Folder' }
> & {
  /** The FileViewer on the file shown, while one is. */
  readonly file: ReactNode;
};

export function Folder({ root, state, props, send, file }: FolderProps) {
  const settings = props ?? defaultSettings;
  const entries = useMemo(() => entriesOf(state, settings), [state, settings]);
  const rows = useMemo(
    () => fileTreeRows(state.path, entries, new Set(state.closed)),
    [state.path, entries, state.closed],
  );
  const changesOn = state.base !== null;
  const deletedCount = changesOn
    ? state.changed.filter(({ status }) => status === 'deleted').length
    : 0;
  const changedCount = entries.filter(({ status }) => status !== null).length;
  const order = useMemo(() => stepsOf(state, settings), [state, settings]);
  const shown = shownOf(state, settings);
  const at = shown === null ? -1 : order.indexOf(shown);
  const hasNext = stepFrom(state, settings, 1) !== null;
  const hasPrevious = stepFrom(state, settings, -1) !== null;
  const reduced = useReducedMotion() ?? false;

  // The folders holding folders: each has a button opening or closing
  // everything inside it.
  const holders = useMemo(() => {
    const folders = foldersOf(state, settings);
    const known = new Set(folders);
    const holding = new Set<string>();
    for (const folder of folders)
      for (
        let at = folder.lastIndexOf('/');
        at > 0;
        at = folder.lastIndexOf('/', at - 1)
      ) {
        const above = folder.slice(0, at);
        if (known.has(above)) holding.add(above);
      }
    return holding;
  }, [state, settings]);
  const closedSet = new Set(state.closed);
  const allOpenInside = (path: string) =>
    !closedSet.has(path) &&
    !state.closed.some((one) => one !== path && isWithin(one, path));
  const anyClosed = state.closed.length > 0;

  // The file shown slides with a swipe on the bar, and the next one in
  // from the side it came, fading as it goes.
  const fileX = useMotionValue(0);
  const fileOpacity = useTransform(fileX, [-200, 0, 200], [0.3, 1, 0.3]);
  const step = (by: number) => {
    if (stepFrom(state, settings, by) === null) return;
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
  const rest = phone && state.showing ? -width : 0;
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

  const header = (
    <header
      className={cn(
        'flex h-11 shrink-0 items-center gap-3 border-b border-border/60 pr-1.5 pl-3',
        'max-sm:h-auto max-sm:min-h-14 max-sm:gap-1 max-sm:pt-[env(safe-area-inset-top)] max-sm:pl-1.5',
      )}
    >
      {/* On a phone, back sits top left: out of the folder, to the tree. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close the folder"
        className="size-11 sm:hidden"
        onClick={() => send({ _tag: 'Closed' })}
      >
        <ArrowLeftIcon className="size-4" />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col" title={state.title}>
        <span className="truncate font-mono text-xs font-medium">
          {state.title}
        </span>
        <span className="truncate text-[11px] text-muted-foreground tabular-nums">
          {changesOn
            ? `${plural(changedCount, 'file')} changed since ${state.base}`
            : plural(entries.length, 'file')}
          {changesOn && !settings.deleted && deletedCount > 0
            ? ` · ${deletedCount} deleted hidden`
            : null}
        </span>
      </div>
      {entries.length === 0 ? null : (
        <button
          type="button"
          aria-label={anyClosed ? 'Expand all folders' : 'Collapse all folders'}
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
      aria-label={`Folder ${state.title}`}
      className="flex h-full min-h-0 flex-col bg-background"
      onKeyDown={onStepKey}
    >
      {/* On a phone the list's screen carries it, so it slides with the list. */}
      {phone && entries.length > 0 ? null : header}
      {entries.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-8 text-center text-sm text-balance text-muted-foreground">
          {!changesOn
            ? `No files in ${state.title}.`
            : deletedCount > 0 && !settings.deleted
              ? `Only deleted files changed in ${state.title} since ${state.base}.`
              : `Nothing changed in ${state.title} since ${state.base}.`}
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
              {...(phone && !state.showing && selected !== null
                ? { onLeft: () => send({ _tag: 'Selected', path: selected }) }
                : {})}
              {...(phone
                ? {
                    // Right: from the file to the list, and from the
                    // list out of the folder.
                    onRight: () =>
                      send({ _tag: state.showing ? 'WentBack' : 'Closed' }),
                  }
                : {})}
            />
            <motion.div
              className="flex min-h-0 min-w-0 flex-1 max-sm:w-[200%] max-sm:flex-none"
              style={phone ? { x: trackX } : undefined}
            >
              <div
                inert={phone && state.showing}
                className="flex min-h-0 w-72 shrink-0 flex-col border-r border-border/60 max-sm:w-1/2 max-sm:border-r-0"
              >
                {phone ? header : null}
                <FileList
                  rows={rows}
                  shown={shown}
                  holders={holders}
                  faded={(row) =>
                    changesOn &&
                    settings.unchanged === 'dim' &&
                    row.status === null
                  }
                  ignored={(path) => isIgnored(path, state.sourceRoots)}
                  allOpenInside={allOpenInside}
                  onToggle={(path) => send({ _tag: 'FolderToggled', path })}
                  onShow={(path) => send({ _tag: 'Selected', path })}
                  onToggleInside={(path) =>
                    send({ _tag: 'InsideToggled', path })
                  }
                />
              </div>
              <div
                inert={phone && !state.showing}
                className="flex min-h-0 min-w-0 flex-1 flex-col bg-background max-sm:w-1/2 max-sm:flex-none max-sm:shadow-[-12px_0_24px_-16px_rgb(0_0_0/0.6)]"
              >
                <motion.div
                  className="min-h-0 flex-1"
                  style={{ x: fileX, opacity: fileOpacity }}
                >
                  {file}
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
}
