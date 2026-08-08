import { useState } from 'react';
import { Effect } from 'effect';
import type { ModuleSourceSnapshot } from 'laymos';
import { useComponentLifecycle } from 'use-effect-ts';

import { FileTree, expandTo } from '../../file-tree';
import { SourceViewer } from '../../source-viewer';
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
import { RefreshCw } from '#lib/lucide';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { initialSourceFile } from './initial-selection';
import { buildSnapshotTree } from './snapshot-tree';
import type { Module } from '../modules/model';

export type LoadModuleSource = (
  modulePath: string,
) => Effect.Effect<ModuleSourceSnapshot, unknown, never>;

export interface ModuleSourceOpenRequest {
  readonly modulePath: string;
  readonly initialFilePath?: string;
}

export function moduleSourceRequest(
  modules: readonly Module[],
  moduleId: string,
): ModuleSourceOpenRequest | undefined {
  const configured = modules.find(({ id }) => id === moduleId);
  if (configured !== undefined) return { modulePath: configured.id };

  for (const module of modules) {
    const nested = module.nested.find(({ id }) => id === moduleId);
    if (nested !== undefined) {
      return {
        modulePath: module.id,
        initialFilePath: `${nested.id}/index.ts`,
      };
    }
  }
  return undefined;
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'success'; readonly snapshot: ModuleSourceSnapshot };

export function ModuleSourceExplorer({
  request,
  loadModuleSource,
  onClose,
}: {
  readonly request: ModuleSourceOpenRequest;
  readonly loadModuleSource: LoadModuleSource;
  readonly onClose: () => void;
}) {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useComponentLifecycle(
    loadModuleSource(request.modulePath).pipe(
      Effect.match({
        onFailure: (error) =>
          setState({ kind: 'failure', message: failureMessage(error) }),
        onSuccess: (snapshot) => setState({ kind: 'success', snapshot }),
      }),
    ),
    { deps: [request.modulePath, reload] },
  );

  const reloadSource = () => {
    setState({ kind: 'loading' });
    setReload((value) => value + 1);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[88vh] w-[min(1440px,95vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pe-14">
          <div className="flex min-w-0 items-center gap-3">
            <DialogTitle className="min-w-0 flex-1 truncate font-mono text-sm">
              {request.modulePath}
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
            Browse the analyzed source files assigned to this Configured Module.
          </DialogDescription>
        </DialogHeader>
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
            snapshot={state.snapshot}
            initialFilePath={request.initialFilePath}
          />
        )}
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

function SnapshotView({
  snapshot,
  initialFilePath,
}: {
  readonly snapshot: ModuleSourceSnapshot;
  readonly initialFilePath?: string;
}) {
  const tree = buildSnapshotTree(snapshot);
  const initialPath = initialSourceFile(snapshot, initialFilePath);
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const initialTreePath =
    initialPath === undefined
      ? undefined
      : tree.treePathBySourcePath.get(initialPath);
  const [expanded, setExpanded] = useState(() =>
    initialTreePath === undefined ? [] : expandTo(tree.paths, initialTreePath),
  );
  const selected = snapshot.files.find(({ path }) => path === selectedPath);
  const selectedTreePath =
    selectedPath === undefined
      ? undefined
      : tree.treePathBySourcePath.get(selectedPath);

  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel defaultSize="24%" minSize="15%" maxSize="45%">
        <nav
          aria-label="Module source files"
          className={cn('size-full overflow-y-auto p-3', scrollbarStyles)}
        >
          <FileTree
            files={tree.paths}
            expanded={expanded}
            onExpandedChange={setExpanded}
            highlightedPaths={
              selectedTreePath === undefined ? [] : [selectedTreePath]
            }
            onPathClick={(treePath) => {
              const sourcePath = tree.sourcePathByTreePath.get(treePath);
              if (sourcePath !== undefined) setSelectedPath(sourcePath);
            }}
          />
        </nav>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="76%" minSize="40%">
        {selected === undefined ? (
          <div className="grid size-full place-items-center text-sm text-muted-foreground">
            No source files
          </div>
        ) : (
          <SourceViewer
            filePath={selected.path}
            content={selected.content}
            className="size-full"
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
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
