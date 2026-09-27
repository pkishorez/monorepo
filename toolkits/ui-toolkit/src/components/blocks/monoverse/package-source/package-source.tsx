import type { Package } from '../analysis';

import { Layers } from '#lib/lucide';
import { Button } from '#components/ui/button';

import {
  SourceExplorer,
  type ChangedPaths,
  type DocumentationSlot,
  type LoadFileDiff,
  type LoadFiles,
  type SourceExplorerTab,
} from '../../source-explorer';
import {
  PackageReadmeStack,
  PackageReadmeView,
  type PackageReadmeDocument,
  type PackageReadmeDocuments,
} from '../package-readme';

interface PackageSourceProps {
  readonly pkg: Package;
  // Relative paths inside the Package: the README first, then each markdown
  // file opened from it on top.
  readonly readmeStack: readonly string[];
  readonly documents: PackageReadmeDocuments;
  readonly onReadmeStackChange: (stack: readonly string[]) => void;
  readonly loadFiles: LoadFiles;
  readonly loadFileDiff?: LoadFileDiff;
  // Monorepo-relative changed paths beneath this Package.
  readonly changedPaths?: ChangedPaths;
  // Where the dialog was left, so it reopens the same way.
  readonly view?: PackageSourceView;
  readonly onViewChange?: (view: PackageSourceView) => void;
  // Offered only for a Package carrying a Laymos badge.
  readonly onOpenLaymos?: () => void;
  readonly onClose: () => void;
}

export interface PackageSourceView {
  readonly tab?: SourceExplorerTab;
  readonly filePath?: string;
}

// What right-clicking a Package opens: its README beside its Package files,
// in the same dialog Laymos opens on a Module.
export function PackageSource({
  pkg,
  readmeStack,
  documents,
  onReadmeStackChange,
  loadFiles,
  loadFileDiff,
  changedPaths,
  view,
  onViewChange,
  onOpenLaymos,
  onClose,
}: PackageSourceProps) {
  const readmePath = readmeStack[0];
  const pushMarkdown = (path: string) =>
    onReadmeStackChange([...readmeStack, path]);

  return (
    <>
      <SourceExplorer
        title={pkg.name}
        pathPrefixes={[pkg.path]}
        filesKey={pkg.path}
        loadFiles={loadFiles}
        loadFileDiff={loadFileDiff}
        changedPaths={changedPaths}
        initialTab={view?.tab}
        initialFilePath={view?.filePath}
        onTabChange={(tab) => onViewChange?.({ ...view, tab })}
        onFileSelect={(filePath) => onViewChange?.({ ...view, filePath })}
        actions={
          pkg.hasLaymos && onOpenLaymos !== undefined ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 sm:min-h-0"
              onClick={onOpenLaymos}
            >
              <Layers className="size-3.5" />
              Open in Laymos
            </Button>
          ) : undefined
        }
        documentation={
          readmePath === undefined
            ? undefined
            : documentationSlot(
                readmePath,
                documents[readmePath] ?? { kind: 'loading' },
                pushMarkdown,
              )
        }
        onClose={onClose}
      />
      <PackageReadmeStack
        pkg={pkg}
        stack={readmeStack.slice(1)}
        documents={documents}
        onPush={pushMarkdown}
        onPop={() => onReadmeStackChange(readmeStack.slice(0, -1))}
      />
    </>
  );
}

function documentationSlot(
  path: string,
  document: PackageReadmeDocument,
  onOpenMarkdown: (path: string) => void,
): DocumentationSlot {
  switch (document.kind) {
    case 'loading':
      return { kind: 'loading' };
    case 'missing':
      return { kind: 'unavailable', message: 'This Package has no README.' };
    case 'failure':
      return { kind: 'unavailable', message: document.message };
    case 'ready':
      return {
        kind: 'ready',
        content: (
          <PackageReadmeView
            path={path}
            document={document}
            onOpenMarkdown={onOpenMarkdown}
          />
        ),
      };
  }
}
