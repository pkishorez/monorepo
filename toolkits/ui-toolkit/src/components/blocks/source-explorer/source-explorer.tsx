import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Effect } from 'effect';
import type { ChangeStatus, FileDiff, ModuleSourceFile } from 'laymos';
import { useComponentLifecycle } from 'use-effect-ts';

import { DiffViewer } from '../diff-viewer';
import { FileTree, expandAll, expandTo } from '../file-tree';
import { SourceViewer, type SourceViewerLine } from '../source-viewer';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import { Spinner } from '#components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import {
  ArrowLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  RefreshCw,
} from '#lib/lucide';
import { useIsMobile } from '#hooks/use-mobile';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { initialSourceFile } from './initial-selection';
import { buildSnapshotTree } from './snapshot-tree';

// One file the Files tab lists. `unanalyzed` files are shown muted; a
// `binary` file carries no content.
export type SourceFile = ModuleSourceFile;

export type LoadFiles = () => Effect.Effect<
  { readonly files: readonly SourceFile[] },
  unknown,
  never
>;

export type LoadFileDiff = (
  path: string,
) => Effect.Effect<FileDiff, unknown, never>;

export type ChangedPaths = ReadonlyMap<string, ChangeStatus>;

// What the host shows in the Documentation tab. The shell renders loading and
// unavailable itself, and falls back to Files when there is nothing to read.
export type DocumentationSlot =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'ready'; readonly content: ReactNode };

export type SourceExplorerTab = 'documentation' | 'files';

export interface SourceExplorerProps {
  readonly title: string;
  // The roots whose files are listed; one root makes the tree relative to it.
  readonly pathPrefixes: readonly string[];
  // Changing this refetches the files, such as when the scope changes.
  readonly filesKey: string;
  readonly loadFiles: LoadFiles;
  readonly loadFileDiff?: LoadFileDiff;
  readonly changedPaths?: ChangedPaths;
  readonly entryPoint?: string;
  readonly initialFilePath?: string;
  readonly documentation?: DocumentationSlot;
  // Reopens on a tab a host remembered; documentation-first when omitted.
  readonly initialTab?: SourceExplorerTab;
  // Reported so a host can reopen the dialog as it was left.
  readonly onTabChange?: (tab: SourceExplorerTab) => void;
  readonly onFileSelect?: (path: string) => void;
  // Extra header buttons beside Reload, such as opening the scope elsewhere.
  readonly actions?: ReactNode;
  // Called on Reload so the host can refetch its documentation too.
  readonly onReload?: () => void;
  readonly onClose: () => void;
}

type UnchangedMode = 'show' | 'dim' | 'hide';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'success'; readonly files: readonly SourceFile[] };

const filesTabId: SourceExplorerTab = 'files';
const documentationTabId: SourceExplorerTab = 'documentation';

/**
 * The dialog every Tool opens on a scope: its documentation beside its files,
 * with changed files marked and shown as diffs against the Base ref.
 */
export function SourceExplorer({
  title,
  pathPrefixes,
  filesKey,
  loadFiles,
  loadFileDiff,
  changedPaths,
  entryPoint,
  initialFilePath,
  documentation,
  initialTab,
  onTabChange,
  onFileSelect,
  actions,
  onReload,
  onClose,
}: SourceExplorerProps) {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useComponentLifecycle(
    loadFiles().pipe(
      Effect.match({
        onFailure: (error) =>
          setState({ kind: 'failure', message: failureMessage(error) }),
        onSuccess: ({ files }) => setState({ kind: 'success', files }),
      }),
    ),
    { deps: [filesKey, reload] },
  );

  const reloadFiles = () => {
    setState({ kind: 'loading' });
    setReload((value) => value + 1);
    onReload?.();
  };

  // Documentation-first: the dialog opens on the Documentation tab and only
  // falls back to Files once loading confirms there's nothing to show there.
  const [activeTab, setActiveTabState] = useState<SourceExplorerTab>(
    initialTab ??
      (documentation === undefined ? filesTabId : documentationTabId),
  );
  const setActiveTab = (tab: SourceExplorerTab) => {
    setActiveTabState(tab);
    onTabChange?.(tab);
  };
  const docUnavailable =
    documentation === undefined || documentation.kind === 'unavailable';

  useEffect(() => {
    if (docUnavailable && activeTab === documentationTabId) {
      setActiveTab(filesTabId);
    }
  }, [docUnavailable, activeTab]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[88vh] sm:w-[min(1440px,95vw)] sm:max-w-none sm:rounded-lg">
        <Tabs
          value={activeTab}
          onValueChange={(tab) => setActiveTab(tab as SourceExplorerTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <DialogHeader className="shrink-0 border-b border-border px-3 py-3 pe-12 sm:px-5 sm:py-4 sm:pe-14">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <DialogTitle className="min-w-0 flex-1 truncate font-mono text-sm">
                {title}
              </DialogTitle>
              {actions}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 sm:min-h-0"
                onClick={reloadFiles}
                disabled={state.kind === 'loading'}
              >
                <RefreshCw className="size-3.5" />
                Reload
              </Button>
            </div>
            <DialogDescription className="sr-only">
              Browse the documentation and files of this scope.
            </DialogDescription>
            <TabsList variant="line" className="mt-1">
              <TabsTrigger
                value={documentationTabId}
                disabled={docUnavailable}
                className="font-mono text-xs lowercase"
              >
                Documentation
              </TabsTrigger>
              <TabsTrigger
                value={filesTabId}
                className="font-mono text-xs lowercase"
              >
                Files
              </TabsTrigger>
            </TabsList>
          </DialogHeader>
          <TabsContent
            value={documentationTabId}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {documentation === undefined || documentation.kind === 'loading' ? (
              <LoadingState label="Loading documentation…" />
            ) : documentation.kind === 'unavailable' ? (
              <UnavailableState message={documentation.message} />
            ) : (
              documentation.content
            )}
          </TabsContent>
          <TabsContent
            value={filesTabId}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {state.kind === 'loading' ? (
              <LoadingState label="Loading files…" />
            ) : state.kind === 'failure' ? (
              <FailureState
                message={state.message}
                onRetry={reloadFiles}
                onClose={onClose}
              />
            ) : (
              <SnapshotView
                key={reload}
                files={state.files}
                pathPrefixes={pathPrefixes}
                entryPoint={entryPoint}
                initialFilePath={initialFilePath}
                loadFileDiff={loadFileDiff}
                changedPaths={changedPaths}
                onFileSelect={onFileSelect}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState({ label }: { readonly label: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {label}
      </div>
    </div>
  );
}

function FailureState({
  message,
  onRetry,
  onClose,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6">
      <div className="max-w-lg text-center">
        <h2 className="text-base font-semibold">Couldn’t load the files</h2>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {message}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function UnavailableState({ message }: { readonly message: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6">
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function SnapshotView({
  files,
  pathPrefixes,
  entryPoint,
  initialFilePath,
  loadFileDiff,
  changedPaths,
  onFileSelect,
}: {
  readonly files: readonly SourceFile[];
  readonly pathPrefixes: readonly string[];
  readonly entryPoint?: string;
  readonly initialFilePath?: string;
  readonly loadFileDiff?: LoadFileDiff;
  readonly changedPaths?: ChangedPaths;
  readonly onFileSelect?: (path: string) => void;
}) {
  const tree = buildSnapshotTree(files, pathPrefixes);
  const initialPath = initialSourceFile(
    files,
    entryPoint,
    initialFilePath,
    changedPaths,
  );
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const initialTreePath =
    initialPath === undefined
      ? undefined
      : tree.treePathBySourcePath.get(initialPath);
  const [expanded, setExpanded] = useState(() =>
    initialTreePath === undefined ? [] : expandTo(tree.paths, initialTreePath),
  );
  const folderStatus = useMemo(
    () => statusByTreePath(tree.treePathBySourcePath, changedPaths),
    [tree.treePathBySourcePath, changedPaths],
  );
  const unanalyzedTreePaths = useMemo(
    () =>
      new Set(
        files
          .filter((file) => file.unanalyzed === true)
          .map(({ path }) => tree.treePathBySourcePath.get(path) ?? path),
      ),
    [files, tree.treePathBySourcePath],
  );
  const [unchanged, setUnchanged] = useState<UnchangedMode>('show');
  const hasChanges = folderStatus.size > 0;
  const visiblePaths = useMemo(
    () =>
      hasChanges && unchanged === 'hide'
        ? tree.paths.filter((treePath) => folderStatus.has(treePath))
        : tree.paths,
    [tree.paths, folderStatus, hasChanges, unchanged],
  );
  const allExpanded = useMemo(() => {
    const folders = expandAll(visiblePaths);
    return folders.length > 0 && folders.every((f) => expanded.includes(f));
  }, [visiblePaths, expanded]);
  const selected = files.find(({ path }) => path === selectedPath);
  const selectedTreePath =
    selectedPath === undefined
      ? undefined
      : tree.treePathBySourcePath.get(selectedPath);
  const [mobileFileOpen, setMobileFileOpen] = useState(false);
  const isMobile = useIsMobile();

  const fileNavigation = (
    <nav aria-label="Files" className="flex size-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-10 sm:size-8"
          aria-label={
            allExpanded ? 'Collapse all folders' : 'Expand all folders'
          }
          title={allExpanded ? 'Collapse all folders' : 'Expand all folders'}
          onClick={() =>
            setExpanded(allExpanded ? [] : expandAll(visiblePaths))
          }
        >
          {allExpanded ? (
            <ChevronsDownUp className="size-3.5" />
          ) : (
            <ChevronsUpDown className="size-3.5" />
          )}
        </Button>
        {hasChanges && (
          <select
            aria-label="Unchanged files"
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:h-8 sm:text-xs"
            value={unchanged}
            onChange={(event) =>
              setUnchanged(event.target.value as UnchangedMode)
            }
          >
            <option value="show">Show unchanged</option>
            <option value="dim">Dim unchanged</option>
            <option value="hide">Hide unchanged</option>
          </select>
        )}
      </div>
      <div
        className={cn('min-h-0 flex-1 overflow-y-auto p-3', scrollbarStyles)}
      >
        <FileTree
          files={visiblePaths}
          expanded={expanded}
          onExpandedChange={setExpanded}
          highlightedPaths={
            selectedTreePath === undefined ? [] : [selectedTreePath]
          }
          iconClassNameForPath={(treePath) =>
            changeAccent(folderStatus.get(treePath))
          }
          classNameForPath={(treePath) =>
            cn(
              folderStatus.has(treePath)
                ? 'font-medium'
                : hasChanges && unchanged === 'dim' && 'opacity-40',
              unanalyzedTreePaths.has(treePath) && 'text-muted-foreground',
            ) || undefined
          }
          onPathClick={(treePath) => {
            const sourcePath = tree.sourcePathByTreePath.get(treePath);
            if (sourcePath !== undefined) {
              setSelectedPath(sourcePath);
              onFileSelect?.(sourcePath);
              if (isMobile) setMobileFileOpen(true);
            }
          }}
        />
      </div>
    </nav>
  );

  const fileContent =
    selected === undefined ? (
      <div className="grid size-full place-items-center text-sm text-muted-foreground">
        No files
      </div>
    ) : (
      <div className="flex size-full min-h-0 flex-col">
        {isMobile && (
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-10"
              aria-label="Back to files"
              onClick={() => setMobileFileOpen(false)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {selected.path}
            </span>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <FileView
            key={selected.path}
            file={selected}
            status={changedPaths?.get(selected.path)}
            loadFileDiff={loadFileDiff}
          />
        </div>
      </div>
    );

  return isMobile ? (
    <div className="min-h-0 flex-1">
      {mobileFileOpen ? fileContent : fileNavigation}
    </div>
  ) : (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel defaultSize="24%" minSize="15%" maxSize="45%">
        {fileNavigation}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="76%" minSize="40%">
        {fileContent}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function FileView({
  file,
  status,
  loadFileDiff,
}: {
  readonly file: SourceFile;
  readonly status?: ChangeStatus;
  readonly loadFileDiff?: LoadFileDiff;
}) {
  const [diff, setDiff] = useState<FileDiff>();
  const showDiff =
    status === 'modified' && file.binary !== true && loadFileDiff !== undefined;

  useComponentLifecycle(
    showDiff
      ? loadFileDiff(file.path).pipe(
          Effect.match({
            onFailure: () => setDiff(undefined),
            onSuccess: setDiff,
          }),
        )
      : Effect.sync(() => setDiff(undefined)),
    { deps: [file.path, showDiff] },
  );

  if (file.binary === true) {
    return <UnavailableState message="Binary file, not shown." />;
  }

  if (showDiff) {
    return diff === undefined ? (
      <LoadingState label="Loading diff…" />
    ) : (
      <DiffViewer
        diff={diff}
        fallbackContent={file.content}
        className="size-full"
      />
    );
  }

  return (
    <SourceViewer
      filePath={file.path}
      content={file.content}
      lineStatuses={status === 'added' ? addedLines(file.content) : undefined}
      className="size-full"
    />
  );
}

// A folder inherits the strongest status beneath it: added only when nothing
// under it is merely modified.
function statusByTreePath(
  treePathBySourcePath: ReadonlyMap<string, string>,
  changedPaths: ChangedPaths | undefined,
): ReadonlyMap<string, ChangeStatus> {
  const statuses = new Map<string, ChangeStatus>();
  if (changedPaths === undefined) return statuses;
  for (const [sourcePath, treePath] of treePathBySourcePath) {
    const status = changedPaths.get(sourcePath);
    if (status === undefined) continue;
    const segments = treePath.split('/');
    for (let depth = segments.length; depth > 0; depth -= 1) {
      const ancestor = segments.slice(0, depth).join('/');
      statuses.set(
        ancestor,
        statuses.get(ancestor) === 'modified' || status === 'modified'
          ? 'modified'
          : 'added',
      );
    }
  }
  return statuses;
}

function addedLines(content: string): readonly SourceViewerLine[] {
  return content
    .split('\n')
    .map((_, index) => ({ status: 'add' as const, number: index + 1 }));
}

function changeAccent(status: ChangeStatus | undefined): string | undefined {
  switch (status) {
    case 'added':
      return 'text-emerald-500';
    case 'modified':
      return 'text-amber-500';
    default:
      return undefined;
  }
}

function failureMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    typeof error._tag === 'string'
  ) {
    return error._tag;
  }
  return String(error);
}
