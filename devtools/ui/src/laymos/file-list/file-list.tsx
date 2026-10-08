import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Effect } from 'effect';
import type {
  ChangeStatus,
  FileContent,
  FileDiff,
  FileList as FileListData,
} from 'laymos';
import { useComponentLifecycle } from 'use-effect-ts';

import { Button } from '@kstackz/web-platform/components/button';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  EyeOff,
  Trash2,
  FileCode2,
  FileDiff as FileDiffIcon,
  X,
} from '@kstackz/web-platform/components/lucide';
import { scrollbarStyles } from '@kstackz/web-platform/components/scroll-styles';
import { cn } from '@kstackz/web-platform/components/utils';
import {
  defaultDiffOptions,
  DiffViewer,
} from '@kstackz/web-platform/components/viewers/diff-viewer';
import {
  expandAll,
  FileTree,
} from '@kstackz/web-platform/components/viewers/file-tree';
import { MarkdownViewer } from '@kstackz/web-platform/components/viewers/markdown-viewer';
import { SourceViewer } from '@kstackz/web-platform/components/viewers/source-viewer';
import { useIsMobile } from '@kstackz/web-platform/components/hooks/use-mobile';

import { ResizeHandle, usePreference } from '../preferences';

export type LoadFileList = (
  modulePath: string,
) => Effect.Effect<FileListData, unknown>;

export type LoadFileContent = (
  path: string,
) => Effect.Effect<FileContent, unknown>;

export type LoadFileDiff = (path: string) => Effect.Effect<FileDiff, unknown>;

export interface FileListProps {
  readonly modulePath: string;
  readonly loadFileList: LoadFileList;
  readonly loadFileContent: LoadFileContent;
  /** Changed paths to mark, by path. */
  readonly changedPaths?: ReadonlyMap<string, ChangeStatus> | undefined;
  /** When given, a changed file may be read as its diff. */
  readonly loadFileDiff?: LoadFileDiff | undefined;
  /**
   * Every folder Module of the Project. When the listed folder holds any,
   * the tree opens down to them and no further; otherwise it opens whole.
   */
  readonly modules?: readonly string[] | undefined;
  /** What the heading calls the listed folder; its path when absent. */
  readonly title?: string | undefined;
  readonly onClose: () => void;
  readonly className?: string | undefined;
}

type Slot<A> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly value: A };

const isMarkdown = (path: string) => /\.(md|mdx|markdown)$/i.test(path);

/** Which files the tree shows when a Change set is there: all, all with the unchanged dimmed, or only the changed. */
type ChangedFiles = 'all' | 'dim' | 'only';

/** The color a changed file or folder is written in. */
const statusText: Readonly<Record<ChangeStatus, string>> = {
  added: 'text-green-700 dark:text-green-400',
  modified: 'text-yellow-700 dark:text-yellow-400',
  deleted: 'text-red-700 dark:text-red-400',
};

/**
 * Each folder's standing from the files beneath it: added when all were
 * added, deleted when all were deleted, modified when any changed.
 */
function folderStatuses(
  paths: readonly string[],
  statusOf: (path: string) => ChangeStatus | undefined,
): ReadonlyMap<string, ChangeStatus> {
  const tally = new Map<
    string,
    { total: number; added: number; deleted: number; changed: number }
  >();
  for (const path of paths) {
    const status = statusOf(path);
    const segments = path.split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      const folder = segments.slice(0, depth).join('/');
      const count = tally.get(folder) ?? {
        total: 0,
        added: 0,
        deleted: 0,
        changed: 0,
      };
      count.total += 1;
      if (status !== undefined) count.changed += 1;
      if (status === 'added') count.added += 1;
      if (status === 'deleted') count.deleted += 1;
      tally.set(folder, count);
    }
  }
  const statuses = new Map<string, ChangeStatus>();
  for (const [folder, count] of tally) {
    if (count.changed === 0) continue;
    statuses.set(
      folder,
      count.deleted === count.total
        ? 'deleted'
        : count.added === count.total
          ? 'added'
          : 'modified',
    );
  }
  return statuses;
}

const changedFilesAria: Readonly<Record<ChangedFiles, string>> = {
  all: 'Show all files',
  dim: 'Dim unchanged files',
  only: 'Show only changed files',
};

const changedFilesLabels: Readonly<Record<ChangedFiles, string>> = {
  all: 'All',
  dim: 'Dim',
  only: 'Changed',
};

/**
 * The File list of one Module: every git-tracked file beneath its folder as
 * one plain tree, nothing hidden, Unanalyzed files dimmed and the Index
 * marked. Opening a file shows it: markdown rendered, code highlighted, a
 * binary file named for what it is. With a Change set, every file and
 * folder is written in the color of its change, and the deleted files stand
 * where they were, read as their diff. The tree's width, File or Diff, the
 * diff's options, which changed files show and whether Unanalyzed and
 * deleted files show are preferences the browser keeps.
 */
export function FileList({
  modulePath,
  loadFileList,
  loadFileContent,
  changedPaths,
  loadFileDiff,
  modules = [],
  title,
  onClose,
  className,
}: FileListProps) {
  const [list, setList] = useState<Slot<FileListData>>({ kind: 'loading' });
  const [chosen, setChosen] = useState<string>();
  const [content, setContent] = useState<Slot<FileContent>>();
  const [diff, setDiff] = useState<Slot<FileDiff>>();
  const [showDiff, setShowDiff] = usePreference('file-list.show-diff', false);
  const [diffOptions, setDiffOptions] = usePreference(
    'file-list.diff-options',
    defaultDiffOptions,
  );
  const [changedFiles, setChangedFiles] = usePreference<ChangedFiles>(
    'file-list.changed-files',
    'all',
  );
  const [treeWidth, setTreeWidth] = usePreference('file-list.tree-width', 288);
  const [hideUnanalyzed, setHideUnanalyzed] = usePreference(
    'file-list.hide-unanalyzed',
    false,
  );
  const [hideDeleted, setHideDeleted] = usePreference(
    'file-list.hide-deleted',
    false,
  );
  const navRef = useRef<HTMLElement>(null);
  // A phone shows one pane at a time: the tree, or the file chosen in it.
  const [reading, setReading] = useState(false);
  const phone = useIsMobile();
  const [expanded, setExpanded] = useState<string[]>([]);
  const chosenStatus =
    chosen === undefined ? undefined : changedPaths?.get(chosen);
  const deleted = chosenStatus === 'deleted';
  const diffable = chosenStatus !== undefined && loadFileDiff !== undefined;
  // A deleted file has nothing left to read but its diff.
  const diffing = diffable && (showDiff || deleted);

  useComponentLifecycle(
    loadFileList(modulePath).pipe(
      Effect.match({
        onFailure: (error) =>
          setList({ kind: 'failed', message: failureMessage(error) }),
        onSuccess: (loaded) => {
          setList({ kind: 'ready', value: loaded });
          // The Index is the first thing to read, when there is one.
          if (loaded.index !== undefined) setChosen(loaded.index);
        },
      }),
    ),
    { deps: [modulePath] },
  );

  useComponentLifecycle(
    chosen === undefined
      ? Effect.void
      : deleted
        ? Effect.sync(() =>
            setContent({ kind: 'ready', value: { path: chosen, content: '' } }),
          )
        : Effect.sync(() => setContent({ kind: 'loading' })).pipe(
            Effect.andThen(loadFileContent(chosen)),
            Effect.match({
              onFailure: (error) =>
                setContent({ kind: 'failed', message: failureMessage(error) }),
              onSuccess: (loaded) =>
                setContent({ kind: 'ready', value: loaded }),
            }),
          ),
    { deps: [chosen, deleted] },
  );

  useComponentLifecycle(
    chosen === undefined || !diffing
      ? Effect.void
      : Effect.sync(() => setDiff({ kind: 'loading' })).pipe(
          Effect.andThen(loadFileDiff(chosen)),
          Effect.match({
            onFailure: (error) =>
              setDiff({ kind: 'failed', message: failureMessage(error) }),
            onSuccess: (loaded) => setDiff({ kind: 'ready', value: loaded }),
          }),
        ),
    { deps: [chosen, diffing] },
  );

  const filtering = changedPaths !== undefined;
  const mode: ChangedFiles = filtering ? changedFiles : 'all';
  // The files git still knows, and the deleted ones back where they stood.
  const allFiles = useMemo(() => {
    if (list.kind !== 'ready') return [];
    const known = list.value.files;
    const listed = new Set(known.map(({ path }) => path));
    const beneath = (path: string) =>
      modulePath === '.' || path.startsWith(`${modulePath}/`);
    const gone = [...(changedPaths ?? [])].flatMap(([path, status]) =>
      status === 'deleted' && beneath(path) && !listed.has(path)
        ? [{ path, analyzed: true }]
        : [],
    );
    return [...known, ...gone];
  }, [list, changedPaths, modulePath]);
  useEffect(() => {
    setExpanded(
      openingFolders(
        allFiles.map(({ path }) => path),
        modulePath,
        modules,
      ),
    );
  }, [allFiles, modulePath, modules]);
  // The Unanalyzed and deleted files among what the filter shows, which the
  // two switches at the foot of the tree hide or show.
  const { files, counts } = useMemo(() => {
    const shown = allFiles.filter(
      ({ path }) => mode !== 'only' || changedPaths?.has(path) === true,
    );
    const isDeleted = (path: string) => changedPaths?.get(path) === 'deleted';
    return {
      files: shown.filter(
        ({ path, analyzed }) =>
          (!hideUnanalyzed || analyzed) && (!hideDeleted || !isDeleted(path)),
      ),
      counts: {
        unanalyzed: shown.filter(({ analyzed }) => !analyzed).length,
        deleted: shown.filter(({ path }) => isDeleted(path)).length,
      },
    };
  }, [allFiles, mode, changedPaths, hideUnanalyzed, hideDeleted]);
  // The tree follows the file being read: the folders above it open and its
  // row scrolls into view, so stepping file to file never loses its place.
  useEffect(() => {
    if (chosen === undefined) return;
    const segments = chosen.split('/');
    const above = segments
      .slice(0, -1)
      .map((_, depth) => segments.slice(0, depth + 1).join('/'));
    setExpanded((current) =>
      above.every((folder) => current.includes(folder))
        ? current
        : [...new Set([...current, ...above])],
    );
    const frame = requestAnimationFrame(() =>
      navRef.current
        ?.querySelector(`[data-path="${CSS.escape(chosen)}"]`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [chosen]);
  const readerRef = useRef<HTMLDivElement>(null);
  // Each file opens at its top.
  useEffect(() => {
    readerRef.current?.scrollTo({ top: 0 });
  }, [chosen]);
  // The changed files shown, in the order the tree lists them: what Next and
  // Previous step through.
  const changedOrder = useMemo(
    () =>
      treeOrder(
        files.flatMap(({ path }) =>
          changedPaths?.has(path) === true ? [path] : [],
        ),
      ),
    [files, changedPaths],
  );
  const statuses = useMemo(
    () =>
      folderStatuses(
        allFiles.map(({ path }) => path),
        (path) => changedPaths?.get(path),
      ),
    [allFiles, changedPaths],
  );
  const statusOf = (path: string) =>
    changedPaths?.get(path) ?? statuses.get(path);
  const analyzed = useMemo(
    () => new Map(files.map(({ path, analyzed }) => [path, analyzed])),
    [files],
  );
  const index = list.kind === 'ready' ? list.value.index : undefined;
  const dimmedPaths = useMemo(
    () =>
      dimmedWithFolders(
        files.map(({ path }) => path),
        new Set(
          files
            .filter(
              ({ path, analyzed }) =>
                !analyzed ||
                (mode === 'dim' && changedPaths?.has(path) !== true),
            )
            .map(({ path }) => path),
        ),
      ),
    [files, mode, changedPaths],
  );
  const unanalyzed = allFiles.filter(({ analyzed }) => !analyzed).length;
  // A file the filter hides is not left open: the first shown one is.
  useEffect(() => {
    if (list.kind !== 'ready' || files.length === 0) return;
    if (chosen !== undefined && files.some(({ path }) => path === chosen))
      return;
    const first = files.find(({ analyzed }) => analyzed);
    if (first !== undefined) setChosen(first.path);
  }, [list.kind, files, chosen]);

  return (
    <div className={cn('flex h-full min-w-0 flex-1 flex-col', className)}>
      {/* On a phone the header is one slim row: the folder, or the file being
          read with the way back to the tree, then its actions. */}
      <header className="flex shrink-0 items-start gap-4 border-b border-border px-6 pb-4 pt-4 max-sm:items-center max-sm:gap-2 max-sm:py-1.5 max-sm:ps-2 max-sm:pe-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground max-sm:hidden">
            File list
          </p>
          {reading && chosen !== undefined && (
            <button
              type="button"
              onClick={() => setReading(false)}
              aria-label="Back to the files"
              className="flex h-9 max-w-full items-center gap-1 rounded-md pe-2 text-left sm:hidden"
            >
              <ChevronLeft
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 truncate font-mono text-sm font-semibold">
                {chosen.slice(chosen.lastIndexOf('/') + 1)}
              </span>
            </button>
          )}
          <h2
            className={cn(
              'mt-1 truncate font-mono text-lg font-semibold leading-tight max-sm:mt-0 max-sm:ps-2 max-sm:text-sm',
              reading && 'max-sm:hidden',
            )}
          >
            {title ?? modulePath}
          </h2>
          {list.kind === 'ready' && (
            <p className="mt-1.5 text-xs text-muted-foreground max-sm:hidden">
              {allFiles.length} {allFiles.length === 1 ? 'file' : 'files'}
              {unanalyzed > 0 && ` · ${unanalyzed} unanalyzed`}
              {filtering &&
                ` · ${allFiles.filter(({ path }) => changedPaths.has(path)).length} changed`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {diffable && !deleted && (
            <Button
              size="sm"
              variant="outline"
              className={cn(!reading && 'max-sm:hidden')}
              aria-pressed={showDiff}
              onClick={() => setShowDiff(!showDiff)}
              title={showDiff ? 'Read the file' : 'Read the diff'}
            >
              <FileDiffIcon className="size-3.5" />
              {showDiff ? 'File' : 'Diff'}
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close (Esc)"
            title="Close (Esc)"
          >
            <X />
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          ref={navRef}
          aria-label="Files"
          style={{ '--tree-width': `${treeWidth}px` } as CSSProperties}
          className={cn(
            'relative flex w-(--tree-width) shrink-0 flex-col border-r border-border max-sm:w-full max-sm:border-r-0',
            reading && 'max-sm:hidden',
          )}
        >
          <ResizeHandle
            label="Resize the file tree"
            className="-right-0.75"
            onMove={(x) => {
              const left = navRef.current?.getBoundingClientRect().left;
              if (left !== undefined)
                setTreeWidth(
                  Math.round(Math.min(640, Math.max(180, x - left))),
                );
            }}
          />
          {filtering && (
            <div className="flex shrink-0 items-center gap-1 border-b border-border p-1.5">
              <div
                role="radiogroup"
                aria-label="Files to show"
                className="flex min-w-0 flex-1 gap-0.5"
              >
                {(['all', 'dim', 'only'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={mode === option}
                    onClick={() => setChangedFiles(option)}
                    aria-label={changedFilesAria[option]}
                    className={cn(
                      'min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors',
                      mode === option
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {changedFilesLabels[option]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto px-2 py-3',
              scrollbarStyles,
            )}
          >
            {list.kind === 'loading' && (
              <p className="px-2 text-sm text-muted-foreground">
                Listing files…
              </p>
            )}
            {list.kind === 'failed' && (
              <p className="px-2 text-sm text-destructive">{list.message}</p>
            )}
            {list.kind === 'ready' && (
              <FileTree
                files={files.map(({ path }) => path)}
                expanded={expanded}
                onExpandedChange={setExpanded}
                dimmedPaths={dimmedPaths}
                highlightedPaths={chosen === undefined ? [] : [chosen]}
                onPathClick={(path) => {
                  if (!analyzed.has(path)) return;
                  setChosen(path);
                  setReading(true);
                }}
                classNameForPath={(path) => {
                  const status = statusOf(path);
                  return status === undefined ? undefined : statusText[status];
                }}
                iconClassNameForPath={(path) => {
                  const status = statusOf(path);
                  return status === undefined ? undefined : statusText[status];
                }}
                renderSuffix={(path) =>
                  path === index ? (
                    <span
                      title="Index"
                      className="rounded-sm bg-sky-500/12 px-1 text-[9px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300"
                    >
                      Index
                    </span>
                  ) : null
                }
              />
            )}
            {list.kind === 'ready' && files.length === 0 && (
              <p className="px-2 text-sm text-muted-foreground">
                {mode === 'only'
                  ? 'No changed files here.'
                  : 'No files to show.'}
              </p>
            )}
          </div>
          {(counts.unanalyzed > 0 || counts.deleted > 0) && (
            <div className="flex shrink-0 flex-col gap-0.5 border-t border-border p-1.5">
              {counts.unanalyzed > 0 && (
                <FootSwitch
                  icon={<EyeOff className="size-3.5 shrink-0" aria-hidden />}
                  label={`${counts.unanalyzed} unanalyzed ${counts.unanalyzed === 1 ? 'file' : 'files'}`}
                  hidden={hideUnanalyzed}
                  onChange={setHideUnanalyzed}
                />
              )}
              {counts.deleted > 0 && (
                <FootSwitch
                  icon={<Trash2 className="size-3.5 shrink-0" aria-hidden />}
                  label={`${counts.deleted} deleted ${counts.deleted === 1 ? 'file' : 'files'}`}
                  hidden={hideDeleted}
                  onChange={setHideDeleted}
                />
              )}
            </div>
          )}
        </nav>
        <section
          className={cn(
            'relative flex min-h-0 min-w-0 flex-1 flex-col',
            !reading && 'max-sm:hidden',
          )}
          aria-label={chosen ?? 'No file chosen'}
        >
          <div
            ref={readerRef}
            // Always a scrollbar, so a short file and a long one sit the same.
            className={cn(
              'flex min-h-0 flex-1 flex-col overflow-y-scroll',
              scrollbarStyles,
            )}
          >
            {chosen === undefined || content === undefined ? (
              <p className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
                <FileCode2 className="size-4" aria-hidden />
                Choose a file to read it.
              </p>
            ) : diffing ? (
              diff === undefined || diff.kind === 'loading' ? (
                <p className="m-auto text-sm text-muted-foreground">
                  Diffing {chosen}…
                </p>
              ) : diff.kind === 'failed' ? (
                <p className="m-auto text-sm text-destructive">
                  {diff.message}
                </p>
              ) : (
                <DiffViewer
                  key={chosen}
                  autoHeight
                  diff={diff.value}
                  options={diffOptions}
                  onOptionsChange={setDiffOptions}
                  fallbackContent={
                    content.kind === 'ready' ? content.value.content : undefined
                  }
                  className="shrink-0 grow"
                />
              )
            ) : deleted ? (
              <p className="m-auto text-sm text-muted-foreground">
                <span className="font-mono">{chosen}</span> was deleted.
              </p>
            ) : content.kind === 'loading' ? (
              <p className="m-auto text-sm text-muted-foreground">
                Reading {chosen}…
              </p>
            ) : content.kind === 'failed' ? (
              <p className="m-auto text-sm text-destructive">
                {content.message}
              </p>
            ) : content.value.binary === true ? (
              <p className="m-auto text-sm text-muted-foreground">
                <span className="font-mono">{chosen}</span> is a binary file.
              </p>
            ) : isMarkdown(chosen) ? (
              <div className="min-h-0 flex-1 p-6 max-sm:p-5">
                <p className="mb-4 font-mono text-xs text-muted-foreground">
                  {chosen}
                </p>
                <MarkdownViewer className="max-w-3xl">
                  {content.value.content}
                </MarkdownViewer>
              </div>
            ) : (
              <SourceViewer
                key={chosen}
                autoHeight
                filePath={chosen}
                content={content.value.content}
                showHeader={!phone}
                className="shrink-0 grow"
              />
            )}
            {changedOrder.length > 0 && (
              <ChangedFilesBar
                order={changedOrder}
                chosen={chosen}
                statusOf={(path) => changedPaths?.get(path)}
                onChoose={(path) => {
                  setChosen(path);
                  setReading(true);
                }}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const collator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Paths in the order a file tree lists them: within each folder, folders
 * before files, then by name.
 */
export function treeOrder(paths: readonly string[]): string[] {
  return [...paths].sort((left, right) => {
    const a = left.split('/');
    const b = right.split('/');
    for (let index = 0; ; index += 1) {
      const aFolder = index < a.length - 1;
      const bFolder = index < b.length - 1;
      if (a[index] !== b[index]) {
        if (aFolder !== bFolder) return aFolder ? -1 : 1;
        return collator.compare(a[index]!, b[index]!);
      }
      if (index >= a.length - 1 || index >= b.length - 1)
        return a.length - b.length;
    }
  });
}

/**
 * The foot of the file being read: the previous and next changed file, and
 * between them where this one stands, which opens every changed file as a
 * tree to jump to.
 */
function ChangedFilesBar({
  order,
  chosen,
  statusOf,
  onChoose,
}: {
  readonly order: readonly string[];
  readonly chosen: string | undefined;
  readonly statusOf: (path: string) => ChangeStatus | undefined;
  readonly onChoose: (path: string) => void;
}) {
  const [listing, setListing] = useState(false);
  const [expanded, setExpanded] = useState<string[]>(() =>
    expandAll([...order]),
  );
  useEffect(() => setExpanded(expandAll([...order])), [order]);
  const at = chosen === undefined ? -1 : order.indexOf(chosen);
  // From a file that did not change, the steps go to the changed files on
  // either side of it in the tree.
  const later =
    at >= 0
      ? at + 1
      : chosen === undefined
        ? 0
        : order.findIndex((path) => treeOrder([chosen, path])[0] === chosen);
  const firstLater = later === -1 ? order.length : later;
  const previous = order[(at >= 0 ? at : firstLater) - 1];
  const next = order[firstLater];
  const step =
    'flex h-9 min-w-0 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors enabled:hover:bg-muted disabled:opacity-40';
  // It lies in the file's own scroll and sticks to its foot, so the file
  // scrolls under the pointer wherever it rests, the bar included.
  return (
    <div className="sticky bottom-0 left-0 z-20 mt-auto">
      {listing && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-full max-h-[50vh] overflow-y-auto border-t border-border bg-background px-2 py-2 shadow-[0_-12px_24px_-12px_rgb(0_0_0/0.25)]',
            scrollbarStyles,
          )}
        >
          <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Changed files
          </p>
          <FileTree
            files={[...order]}
            expanded={expanded}
            onExpandedChange={setExpanded}
            highlightedPaths={chosen === undefined ? [] : [chosen]}
            onPathClick={(path) => {
              if (!order.includes(path)) return;
              onChoose(path);
              setListing(false);
            }}
            classNameForPath={(path) => {
              const status = statusOf(path);
              return status === undefined ? undefined : statusText[status];
            }}
            iconClassNameForPath={(path) => {
              const status = statusOf(path);
              return status === undefined ? undefined : statusText[status];
            }}
          />
        </div>
      )}
      <nav
        aria-label="Changed files"
        className="flex h-12 shrink-0 items-center gap-1 border-t border-border bg-background px-2"
      >
        <button
          type="button"
          className={step}
          disabled={previous === undefined}
          onClick={() => previous !== undefined && onChoose(previous)}
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
          Previous
        </button>
        <button
          type="button"
          aria-expanded={listing}
          onClick={() => setListing(!listing)}
          className="mx-auto flex h-9 min-w-0 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <FileDiffIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {at >= 0
              ? `${at + 1} of ${order.length} changed`
              : `${order.length} changed`}
          </span>
          <ChevronUp
            className={cn(
              'size-3.5 shrink-0 transition-transform',
              !listing && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className={step}
          disabled={next === undefined}
          onClick={() => next !== undefined && onChoose(next)}
        >
          Next
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </button>
      </nav>
    </div>
  );
}

/** One kind of file at the foot of the tree, hidden or shown at a press. */
function FootSwitch({
  icon,
  label,
  hidden,
  onChange,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly hidden: boolean;
  readonly onChange: (hidden: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={hidden}
      onClick={() => onChange(!hidden)}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">
        {label}
        {hidden ? ' hidden' : ''}
      </span>
      <span className="shrink-0 font-medium text-foreground">
        {hidden ? 'Show' : 'Hide'}
      </span>
    </button>
  );
}

/**
 * The dimmed files, and every folder whose files are all dimmed: a folder
 * holding nothing but dimmed files dims with them.
 */
export function dimmedWithFolders(
  files: readonly string[],
  dimmed: ReadonlySet<string>,
): string[] {
  const lit = new Set<string>();
  const folders = new Set<string>();
  for (const path of files) {
    const segments = path.split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      const folder = segments.slice(0, depth).join('/');
      folders.add(folder);
      if (!dimmed.has(path)) lit.add(folder);
    }
  }
  return [...dimmed, ...[...folders].filter((folder) => !lit.has(folder))];
}

/**
 * The folders the tree opens with. Beneath a folder holding Modules, the
 * way down to each Module opens and the Modules stay closed; a folder
 * holding none opens whole. The folders above it always open.
 */
export function openingFolders(
  files: readonly string[],
  folder: string,
  modules: readonly string[],
): string[] {
  const within = (path: string, parent: string) =>
    parent === '.' || path === parent || path.startsWith(`${parent}/`);
  const nested = modules.filter(
    (path) => path !== folder && within(path, folder),
  );
  const all = expandAll([...files]);
  if (nested.length === 0) return all;
  return all.filter(
    (path) =>
      folder.startsWith(`${path}/`) ||
      path === folder ||
      (nested.some((module) => module.startsWith(`${path}/`)) &&
        !nested.some((module) => within(path, module))),
  );
}

function failureMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof error.message === 'string')
      return error.message;
    if ('_tag' in error && typeof error._tag === 'string') return error._tag;
  }
  return String(error);
}
