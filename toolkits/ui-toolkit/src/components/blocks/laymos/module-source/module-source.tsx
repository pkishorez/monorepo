import { useState } from 'react';
import { Effect } from 'effect';
import type {
  Documentation,
  DocumentationScope,
  ModuleSourceFile,
} from 'laymos';
import { useComponentLifecycle } from 'use-effect-ts';

import { MarkdownViewer } from '../../markdown-viewer';
import {
  SourceExplorer,
  type ChangedPaths,
  type DocumentationSlot,
  type LoadFileDiff,
} from '../../source-explorer';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import type { Module } from '../analysis-presentation';

export type { ChangedPaths, LoadFileDiff } from '../../source-explorer';

export type LoadSourceFiles = (
  pathPrefixes: readonly string[],
) => Effect.Effect<
  { readonly files: readonly ModuleSourceFile[] },
  unknown,
  never
>;

export type LoadDocumentation = (
  scope: DocumentationScope,
) => Effect.Effect<Documentation, unknown, never>;

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

// Opens one Laymos scope in the shared source dialog: its configured
// Documentation beside the files beneath its roots.
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
  const [documentation, setDocumentation] = useState<DocumentationSlot>({
    kind: 'loading',
  });
  const scopeKey = JSON.stringify(request.scope);

  useComponentLifecycle(
    loadDocumentation === undefined
      ? Effect.void
      : loadDocumentation(request.scope).pipe(
          Effect.match({
            onFailure: (error) =>
              setDocumentation({
                kind: 'unavailable',
                message: failureMessage(error),
              }),
            onSuccess: (loaded) => setDocumentation(documentationSlot(loaded)),
          }),
        ),
    { deps: [scopeKey, reload] },
  );

  return (
    <SourceExplorer
      title={request.title}
      pathPrefixes={request.pathPrefixes}
      filesKey={request.pathPrefixes.join('\0')}
      loadFiles={() => loadSourceFiles(request.pathPrefixes)}
      loadFileDiff={loadFileDiff}
      changedPaths={changedPaths}
      entryPoint={request.entryPoint}
      initialFilePath={request.initialFilePath}
      documentation={
        loadDocumentation === undefined ? undefined : documentation
      }
      onReload={() => {
        setDocumentation({ kind: 'loading' });
        setReload((value) => value + 1);
      }}
      onClose={onClose}
    />
  );
}

function documentationSlot(documentation: Documentation): DocumentationSlot {
  if (documentation.content === undefined) {
    return {
      kind: 'unavailable',
      message: 'No documentation is configured for this scope.',
    };
  }
  return {
    kind: 'ready',
    content: (
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto p-4 sm:p-6',
          scrollbarStyles,
        )}
      >
        <div className="mx-auto max-w-3xl">
          {documentation.path !== undefined && (
            <p className="mb-4 font-mono text-xs text-muted-foreground">
              {documentation.path}
            </p>
          )}
          <MarkdownViewer>{documentation.content}</MarkdownViewer>
        </div>
      </div>
    ),
  };
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
