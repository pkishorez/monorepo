import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Effect } from 'effect';
import type { Branch, ChangeSet, FileContent } from 'laymos';
import type { DependencyKind, MonorepoAnalysis, Package } from '../analysis';
import { useComponentLifecycle } from 'use-effect-ts';

import {
  BookOpen,
  Boxes,
  ChevronDown,
  Layers,
  Network,
  PackageIcon,
  TriangleAlert,
} from '@kstackz/web-platform/components/lucide';
import { Badge } from '@kstackz/web-platform/components/badge';
import { Button } from '@kstackz/web-platform/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@kstackz/web-platform/components/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@kstackz/web-platform/components/empty';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import { cn } from '@kstackz/web-platform/components/utils';
import {
  ChangesMenu,
  defaultGitOptions,
  uncommittedBaseRef,
  type GitOptions,
} from '@kstackz/web-platform/components/viewers/git-changes';
import type { LoadFileDiff } from '@kstackz/web-platform/components/viewers/source-explorer';

import { FileList } from '../../laymos/file-list';
import { Laymo } from '../../laymos/laymo';
import { LaymosDrilldown } from '../laymos-drilldown';
import {
  dependencyKindLabels,
  dependencyKinds,
  packageCards,
  type MonoverseLayout,
} from '../package-cards';

export type MonoverseLoadError = {
  readonly _tag: string;
  readonly message?: string;
  readonly path?: string;
  readonly reason?: string;
};

export type LoadMonorepoAnalysis = () => Effect.Effect<
  MonorepoAnalysis,
  MonoverseLoadError
>;

// The host supplies the Embedded Laymos content for one Package's Project.
export type RenderLaymos = (args: {
  projectPath: string;
  pkg: Package;
  onExit: () => void;
}) => ReactNode;

export type MonoverseProps = {
  monorepoPath: string;
  loadAnalysis: LoadMonorepoAnalysis;
  // Refetch when it changes.
  reloadNonce?: number;
  renderLaymos: RenderLaymos;
  // Controlled: which Package is open in Embedded Laymos.
  openPackage?: string | null;
  onOpenPackageChange?: (name: string | null) => void;
  // Reads one file of the Monorepo by its Monorepo-relative path.
  loadFile: (path: string) => Effect.Effect<FileContent, unknown>;
  // The Monorepo's Change set against `baseRef`, with every path git knows:
  // the Package files are listed from them, and a Package change status
  // tells added from modified by them. Leaving `changes` out hides the git
  // menu, as when the Monorepo is not a git repository.
  changes?: ChangeSet;
  knownFiles?: readonly string[];
  branches?: readonly Branch[];
  baseRef?: string;
  onBaseRefChange?: (baseRef: string) => void;
  loadFileDiff?: LoadFileDiff;
  className?: string;
};

const noFiles: readonly string[] = [];
const noBranches: readonly Branch[] = [];
const hints = [
  'click to select',
  '› opens in place',
  'double-click opens in Laymos',
  'right-click for files',
];

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly error: MonoverseLoadError }
  | { readonly kind: 'success'; readonly analysis: MonorepoAnalysis };

/**
 * Monoverse: one Monorepo drawn with the Laymo, Package groups as boxes
 * holding their Packages or every Package ranked together. A right-click
 * lists a Package's files; a double-click opens it in Embedded Laymos.
 */
export function Monoverse({
  monorepoPath,
  loadAnalysis,
  reloadNonce = 0,
  renderLaymos,
  openPackage: controlledOpen,
  onOpenPackageChange,
  loadFile,
  changes,
  knownFiles = noFiles,
  branches = noBranches,
  baseRef = uncommittedBaseRef,
  onBaseRefChange,
  loadFileDiff,
  className,
}: MonoverseProps) {
  const [gitOptions, setGitOptions] = useState<GitOptions>(defaultGitOptions);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [layout, setLayout] = useState<MonoverseLayout>('folders');
  const [activeKinds, setActiveKinds] = useState<ReadonlySet<DependencyKind>>(
    () => new Set(dependencyKinds),
  );
  const [filesFor, setFilesFor] = useState<string>();
  const [open, setOpen] = useControllable(
    controlledOpen,
    onOpenPackageChange,
    null,
  );

  useComponentLifecycle(
    Effect.suspend(loadAnalysis).pipe(
      Effect.match({
        onFailure: (error) => setState({ kind: 'failure', error }),
        onSuccess: (analysis) => setState({ kind: 'success', analysis }),
      }),
    ),
    { deps: [monorepoPath, reloadNonce, retry] },
  );

  const analysis = state.kind === 'success' ? state.analysis : undefined;
  const shownChanges = gitOptions.showChanges ? changes : undefined;
  const cards = useMemo(
    () =>
      analysis === undefined
        ? undefined
        : packageCards({
            analysis,
            layout,
            activeKinds,
            changes: shownChanges,
            knownFiles,
            showDeleted: gitOptions.includeDeleted,
          }),
    [analysis, layout, activeKinds, shownChanges, knownFiles, gitOptions],
  );
  const changedPaths = useMemo(
    () =>
      shownChanges === undefined
        ? undefined
        : new Map(shownChanges.files.map(({ path, status }) => [path, status])),
    [shownChanges],
  );

  // A folder's files are what git knows beneath it, its README first; the
  // Monorepo's own folder holds every file.
  const loadFileList = useCallback(
    (folder: string) =>
      Effect.sync(() => {
        const files =
          folder === '.'
            ? knownFiles
            : knownFiles.filter((path) => path.startsWith(`${folder}/`));
        const readme = folder === '.' ? 'README.md' : `${folder}/README.md`;
        return {
          modulePath: folder,
          ...(files.includes(readme) ? { index: readme } : {}),
          files: files.map((path) => ({ path, analyzed: true })),
        };
      }),
    [knownFiles],
  );

  const badgesOf = useCallback(
    (path: string) => {
      const pkg = cards?.packages.get(path);
      return pkg === undefined ? null : <PackageBadges pkg={pkg} />;
    },
    [cards],
  );

  const frame = cn(
    'relative flex min-h-0 flex-col overflow-hidden bg-background md:rounded-xl md:border md:border-border md:shadow-sm',
    className,
  );

  if (state.kind === 'loading') {
    return (
      <div className={frame}>
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Spinner />
            </EmptyMedia>
            <EmptyTitle>Reading Monorepo</EmptyTitle>
            <EmptyDescription className="font-mono text-xs">
              {monorepoPath}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (state.kind === 'failure') {
    return (
      <div className={frame}>
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>Could not read this Monorepo</EmptyTitle>
            <EmptyDescription>{failureMessage(state.error)}</EmptyDescription>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setState({ kind: 'loading' });
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (analysis === undefined || cards === undefined)
    return <div className={frame} />;

  if (analysis.packages.length === 0) {
    return (
      <div className={frame}>
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>No Packages</EmptyTitle>
            <EmptyDescription>
              {analysis.name} has no folder matched by its workspace globs that
              holds a package.json.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const openPkg =
    open === null
      ? undefined
      : analysis.packages.find((pkg) => pkg.name === open);
  const embedded = openPkg?.hasLaymos ? openPkg : undefined;
  // A Package with a Laymos Config opens in Laymos; any other shows its files.
  const openCard = (path: string) => {
    if (!cards.packages.has(path)) return;
    const pkg = cards.packages.get(path);
    if (pkg?.hasLaymos) setOpen(pkg.name);
    else setFilesFor(path);
  };
  const changedCount =
    cards.changeIndex === undefined
      ? 0
      : [...cards.packages.keys()].filter((path) =>
          cards.changeIndex!.modules.has(path),
        ).length;

  return (
    <div className={frame}>
      <MonoverseHeader
        analysis={analysis}
        layout={layout}
        onLayoutChange={setLayout}
        activeKinds={activeKinds}
        onActiveKindsChange={setActiveKinds}
        changesMenu={
          changes === undefined ? undefined : (
            <ChangesMenu
              options={gitOptions}
              baseRef={baseRef}
              branches={branches}
              hasChanges={changedCount > 0}
              ownerLabel="Packages"
              offerDeleted
              onOptionsChange={setGitOptions}
              onBaseRefChange={onBaseRefChange}
            />
          )
        }
      />
      <Laymo
        // Each layout is its own picture, opened afresh.
        key={layout}
        analysis={cards.analysis}
        changeIndex={cards.changeIndex}
        onlyChanged={
          cards.changeIndex !== undefined && !gitOptions.includeUnchanged
        }
        findings={cards.findings}
        showRules={false}
        cardsNoun="Packages"
        projectName={analysis.name}
        initiallyOpen={cards.groups}
        outlineByRank={layout === 'ranks'}
        badgesOf={badgesOf}
        fitNames
        hints={hints}
        onOpen={openCard}
        onOpenFiles={setFilesFor}
        panel={
          filesFor === undefined
            ? undefined
            : {
                label: `Files of ${filesFor === '.' ? analysis.name : filesFor}`,
                content: (
                  <FileList
                    key={filesFor}
                    modulePath={filesFor}
                    loadFileList={loadFileList}
                    loadFileContent={loadFile}
                    loadFileDiff={loadFileDiff}
                    changedPaths={changedPaths}
                    modules={[...cards.packages.keys()]}
                    title={filesFor === '.' ? analysis.name : undefined}
                    onClose={() => setFilesFor(undefined)}
                  />
                ),
                onClose: () => setFilesFor(undefined),
              }
        }
        className="min-h-0 flex-1"
      />
      <LaymosDrilldown
        monorepoName={analysis.name}
        pkg={embedded}
        onExit={() => setOpen(null)}
        renderContent={(pkg) =>
          renderLaymos({
            projectPath: `${monorepoPath}/${pkg.path}`,
            pkg,
            onExit: () => setOpen(null),
          })
        }
      />
    </div>
  );
}

/** The Laymos badge, and the Stories badge beside it when there are Stories. */
function PackageBadges({ pkg }: { readonly pkg: Package }) {
  if (!pkg.hasLaymos) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span role="img" aria-label="Has a Laymos Config" title="Laymos">
        <Layers aria-hidden className="size-3 text-primary" />
      </span>
      {pkg.hasStories && (
        <span role="img" aria-label="Has Stories" title="Stories">
          <BookOpen aria-hidden className="size-3 text-primary" />
        </span>
      )}
    </span>
  );
}

const layoutLabels: Readonly<Record<MonoverseLayout, string>> = {
  folders: 'Folders',
  ranks: 'Ranks',
};

export function MonoverseHeader({
  analysis,
  layout,
  onLayoutChange,
  activeKinds,
  onActiveKindsChange,
  changesMenu,
  className,
}: {
  readonly analysis: MonorepoAnalysis;
  readonly layout: MonoverseLayout;
  readonly onLayoutChange: (layout: MonoverseLayout) => void;
  readonly activeKinds: ReadonlySet<DependencyKind>;
  readonly onActiveKindsChange: (kinds: ReadonlySet<DependencyKind>) => void;
  // The git menu, when the host has a Change set to show.
  readonly changesMenu?: ReactNode;
  readonly className?: string;
}) {
  const hiddenCount = dependencyKinds.filter(
    (kind) => !activeKinds.has(kind),
  ).length;
  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-4',
        className,
      )}
    >
      <Boxes className="size-4 shrink-0 text-muted-foreground" />
      <h2 className="min-w-0 truncate text-sm font-semibold">
        {analysis.name}
      </h2>
      <Badge variant="secondary" className="hidden tabular-nums sm:inline-flex">
        {analysis.packages.length}{' '}
        {analysis.packages.length === 1 ? 'Package' : 'Packages'}
      </Badge>
      <div className="ms-auto flex items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Layout"
          className="flex h-8 items-center rounded-md border border-border/60 p-0.5 font-mono text-xs"
        >
          {(['folders', 'ranks'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={layout === option}
              onClick={() => onLayoutChange(option)}
              className={cn(
                'h-full rounded-[5px] px-2.5 lowercase transition-colors',
                layout === option
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {layoutLabels[option]}
            </button>
          ))}
        </div>
        {changesMenu}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Connections"
            title="Which Dependency kinds to draw"
            className="flex h-8 items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 font-mono text-xs text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Network className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="hidden truncate lowercase md:inline">
              {hiddenCount === 0
                ? 'All connections'
                : hiddenCount === dependencyKinds.length
                  ? 'No connections'
                  : `${dependencyKinds.length - hiddenCount} of ${dependencyKinds.length} kinds`}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 font-mono">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[10px] lowercase">
                Connections
              </DropdownMenuLabel>
              {dependencyKinds.map((kind) => (
                <DropdownMenuCheckboxItem
                  className="text-xs lowercase"
                  key={kind}
                  checked={activeKinds.has(kind)}
                  onCheckedChange={(checked) => {
                    const next = new Set(activeKinds);
                    if (checked) next.add(kind);
                    else next.delete(kind);
                    onActiveKindsChange(next);
                  }}
                >
                  {dependencyKindLabels[kind]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function useControllable<T>(
  controlled: T | undefined,
  onChange: ((value: T) => void) | undefined,
  initial: T,
): [T, (value: T) => void] {
  const [internal, setInternal] = useState<T>(initial);
  const value = controlled === undefined ? internal : controlled;
  const set = (next: T) => {
    if (controlled === undefined) setInternal(next);
    onChange?.(next);
  };
  return [value, set];
}

function failureMessage(error: MonoverseLoadError): string {
  return (
    error.message ??
    error.reason ??
    (error.path === undefined ? error._tag : `${error._tag}: ${error.path}`)
  );
}

export type {
  DependencyKind,
  MonorepoAnalysis,
  Package,
  PackageCycleViolation,
  PackageDependency,
} from '../analysis';
