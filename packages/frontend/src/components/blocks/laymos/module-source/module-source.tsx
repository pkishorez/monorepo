import { useEffect, useMemo, useState } from 'react';
import { Effect } from 'effect';
import type {
  ChangeStatus,
  Documentation,
  DocumentationScope,
  FileDiff,
  ModuleSourceFile,
} from 'laymos';
import { useComponentLifecycle } from 'use-effect-ts';

import { DiffViewer } from '../../diff-viewer';
import { FileTree, expandAll, expandTo } from '../../file-tree';
import { MarkdownViewer } from '../../markdown-viewer';
import { SourceViewer, type SourceViewerLine } from '../../source-viewer';
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
import { ChevronsDownUp, ChevronsUpDown, RefreshCw } from '#lib/lucide';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { initialSourceFile } from './initial-selection';
import { buildSnapshotTree } from './snapshot-tree';
import type { Module } from '../analysis-presentation';

export type LoadSourceFiles = (
  pathPrefixes: readonly string[],
) => Effect.Effect<
  { readonly files: readonly ModuleSourceFile[] },
  unknown,
  never
>;

export type LoadFileDiff = (
  path: string,
) => Effect.Effect<FileDiff, unknown, never>;

export type LoadDocumentation = (
  scope: DocumentationScope,
) => Effect.Effect<Documentation, unknown, never>;

export type ChangedPaths = ReadonlyMap<string, ChangeStatus>;

// One scope this dialog can explore — a Configured Module, a Module Graph, a
// Layer, or a LayerGraph — reduced to what fetching and labeling need: a
// title, the project-relative roots whose files belong to it, the
// Documentation scope it reads, and an optional entry point (only a Module
// has one).
export interface SourceOpenRequest {
  readonly title: string;
  readonly pathPrefixes: readonly string[];
  readonly scope: DocumentationScope;
  readonly entryPoint?: string;
  readonly initialFilePath?: string;
}

export function moduleSourceRequest(
  modules: readonly Module[],
  moduleId: string,
): SourceOpenRequest | undefined {
  const configured = modules.find(({ id }) => id === moduleId);
  return configured === undefined
    ? undefined
    : {
        title: configured.id,
        pathPrefixes: [configured.id],
        scope: { kind: 'module', modulePath: configured.id },
      };
}

type UnchangedMode = 'show' | 'dim' | 'hide';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly message: string }
  | {
      readonly kind: 'success';
      readonly files: readonly ModuleSourceFile[];
    };

type DocumentationState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'success'; readonly documentation: Documentation };

const filesTabId = 'files';
const documentationTabId = 'documentation';

export function ModuleSourceExplorer({
  request,
  loadSourceFiles,
  loadFileDiff,
  loadDocumentation,
  changedPaths,
  onClose,
}: {
  readonly request: SourceOpenRequest;
  readonly loadSourceFiles: LoadSourceFiles;
  readonly loadFileDiff?: LoadFileDiff;
  readonly loadDocumentation?: LoadDocumentation;
  readonly changedPaths?: ChangedPaths;
  readonly onClose: () => void;
}) {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const prefixKey = request.pathPrefixes.join('\0');

  useComponentLifecycle(
    loadSourceFiles(request.pathPrefixes).pipe(
      Effect.match({
        onFailure: (error) =>
          setState({ kind: 'failure', message: failureMessage(error) }),
        onSuccess: ({ files }) => setState({ kind: 'success', files }),
      }),
    ),
    { deps: [prefixKey, reload] },
  );

  const reloadSource = () => {
    setState({ kind: 'loading' });
    setReload((value) => value + 1);
  };

  // Documentation-first: the dialog opens on the Documentation tab and only
  // falls back to Files once loading confirms there's nothing to show there.
  const [activeTab, setActiveTab] = useState(
    loadDocumentation === undefined ? filesTabId : documentationTabId,
  );
  const [docState, setDocState] = useState<DocumentationState>({
    kind: 'loading',
  });
  const scopeKey = JSON.stringify(request.scope);

  useComponentLifecycle(
    loadDocumentation === undefined
      ? Effect.sync(() => setDocState({ kind: 'loading' }))
      : loadDocumentation(request.scope).pipe(
          Effect.match({
            onFailure: (error) =>
              setDocState({ kind: 'failure', message: failureMessage(error) }),
            onSuccess: (documentation) =>
              setDocState({ kind: 'success', documentation }),
          }),
        ),
    { deps: [scopeKey, reload] },
  );

  const docUnavailable =
    loadDocumentation === undefined ||
    docState.kind === 'failure' ||
    (docState.kind === 'success' &&
      docState.documentation.content === undefined);

  useEffect(() => {
    if (docUnavailable && activeTab === documentationTabId) {
      setActiveTab(filesTabId);
    }
  }, [docUnavailable, activeTab]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[88vh] w-[min(1440px,95vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pe-14">
            <div className="flex min-w-0 items-center gap-3">
              <DialogTitle className="min-w-0 flex-1 truncate font-mono text-sm">
                {request.title}
              </DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reloadSource}
                disabled={state.kind === 'loading'}
              >
                <RefreshCw className="size-3.5" />
                Reload
              </Button>
            </div>
            <DialogDescription className="sr-only">
              Browse the documentation and source files of this scope.
            </DialogDescription>
            <TabsList variant="line" className="mt-1">
              <TabsTrigger value={documentationTabId} disabled={docUnavailable}>
                Documentation
              </TabsTrigger>
              <TabsTrigger value={filesTabId}>Files</TabsTrigger>
            </TabsList>
          </DialogHeader>
          <TabsContent
            value={documentationTabId}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <DocumentationTab state={docState} />
          </TabsContent>
          <TabsContent
            value={filesTabId}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {state.kind === 'loading' ? (
              <LoadingState />
            ) : state.kind === 'failure' ? (
              <FailureState
                message={state.message}
                onRetry={reloadSource}
                onClose={onClose}
              />
            ) : (
              <SnapshotView
                key={reload}
                files={state.files}
                pathPrefixes={request.pathPrefixes}
                entryPoint={request.entryPoint}
                initialFilePath={request.initialFilePath}
                loadFileDiff={loadFileDiff}
                changedPaths={changedPaths}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading Module source…
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
        <h2 className="text-base font-semibold">Couldn’t load Module source</h2>
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

function DocumentationTab({ state }: { readonly state: DocumentationState }) {
  if (state.kind === 'loading') return <LoadingState />;
  if (state.kind === 'failure') {
    return <UnavailableState message={state.message} />;
  }
  if (state.documentation.content === undefined) {
    return (
      <UnavailableState message="No documentation is configured for this scope." />
    );
  }

  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto p-6', scrollbarStyles)}>
      {state.documentation.path !== undefined && (
        <p className="mb-4 font-mono text-xs text-muted-foreground">
          {state.documentation.path}
        </p>
      )}
      <MarkdownViewer>{state.documentation.content}</MarkdownViewer>
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
}: {
  readonly files: readonly ModuleSourceFile[];
  readonly pathPrefixes: readonly string[];
  readonly entryPoint?: string;
  readonly initialFilePath?: string;
  readonly loadFileDiff?: LoadFileDiff;
  readonly changedPaths?: ChangedPaths;
}) {
  const tree = buildSnapshotTree(files, pathPrefixes);
  const initialPath = initialSourceFile(files, entryPoint, initialFilePath);
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

  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel defaultSize="24%" minSize="15%" maxSize="45%">
        <nav
          aria-label="Module source files"
          className="flex size-full min-h-0 flex-col"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={
                allExpanded ? 'Collapse all folders' : 'Expand all folders'
              }
              title={
                allExpanded ? 'Collapse all folders' : 'Expand all folders'
              }
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
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
            className={cn(
              'min-h-0 flex-1 overflow-y-auto p-3',
              scrollbarStyles,
            )}
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
                folderStatus.has(treePath)
                  ? 'font-medium'
                  : hasChanges && unchanged === 'dim'
                    ? 'opacity-40'
                    : undefined
              }
              onPathClick={(treePath) => {
                const sourcePath = tree.sourcePathByTreePath.get(treePath);
                if (sourcePath !== undefined) setSelectedPath(sourcePath);
              }}
            />
          </div>
        </nav>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="76%" minSize="40%">
        {selected === undefined ? (
          <div className="grid size-full place-items-center text-sm text-muted-foreground">
            No source files
          </div>
        ) : (
          <FileView
            key={selected.path}
            file={selected}
            status={changedPaths?.get(selected.path)}
            loadFileDiff={loadFileDiff}
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function FileView({
  file,
  status,
  loadFileDiff,
}: {
  readonly file: ModuleSourceFile;
  readonly status?: ChangeStatus;
  readonly loadFileDiff?: LoadFileDiff;
}) {
  const [diff, setDiff] = useState<FileDiff>();
  const showDiff = status === 'modified' && loadFileDiff !== undefined;

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

  if (showDiff) {
    return diff === undefined ? (
      <LoadingState />
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
