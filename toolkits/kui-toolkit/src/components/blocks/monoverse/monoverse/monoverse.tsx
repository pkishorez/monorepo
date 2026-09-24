import { useMemo, useState, type ReactNode } from 'react';
import { Effect } from 'effect';
import type { Branch, ChangeSet } from 'laymos';
import type { DependencyKind, MonorepoAnalysis, Package } from '../analysis';
import { useComponentLifecycle } from 'use-effect-ts';

import {
  Boxes,
  ChevronDown,
  Eye,
  Network,
  PackageIcon,
  PanelRightOpen,
  TriangleAlert,
} from '#lib/lucide';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#components/ui/sheet';
import { Spinner } from '#components/ui/spinner';
import { useIsMobile } from '#hooks/use-mobile';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import {
  ChangesMenu,
  changedPathsUnder,
  defaultGitOptions,
  uncommittedBaseRef,
  type GitOptions,
} from '../../git-changes';
import type { LoadFileDiff, LoadFiles } from '../../source-explorer';
import { LaymosDrilldown } from '../laymos-drilldown';
import { MonorepoCanvas, type ConnectionVisibility } from '../monorepo-canvas';
import {
  buildMonorepoView,
  dependencyKindLabels,
  dependencyKinds,
  packageChangeStatuses,
  resolvePackageFocus,
} from '../monorepo-presentation';
import { PackageDetails } from '../package-details';
import type { PackageReadmeDocuments } from '../package-readme';
import { PackageSource, type PackageSourceView } from '../package-source';
import { PackageTree } from '../package-tree';

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
  // Controlled Package focus (name); uncontrolled when omitted.
  selectedPackage?: string | null;
  onSelectedPackageChange?: (name: string | null) => void;
  // Controlled: which Package is open in Embedded Laymos.
  openPackage?: string | null;
  onOpenPackageChange?: (name: string | null) => void;
  // Controlled: the Package README stack (relative paths, bottom first) open
  // over the canvas for the selected Package.
  readmeStack?: readonly string[];
  onReadmeStackChange?: (stack: readonly string[]) => void;
  // Selects the Package and opens its README in one step. Defaults to doing
  // both through the two callbacks above.
  onOpenReadme?: (name: string) => void;
  // The host loads each stacked file; a missing entry shows as loading.
  readmeDocuments?: PackageReadmeDocuments;
  // The Package files of one Package, listed beside its README.
  loadPackageFiles: (pkg: Package) => ReturnType<LoadFiles>;
  // The Monorepo's Change set against `baseRef`, with every path git knows so
  // a Package change status can tell added from modified. Leaving `changes`
  // out hides the git menu, as when the Monorepo is not a git repository.
  changes?: ChangeSet;
  knownFiles?: readonly string[];
  branches?: readonly Branch[];
  baseRef?: string;
  onBaseRefChange?: (baseRef: string) => void;
  loadFileDiff?: LoadFileDiff;
  className?: string;
};

const packageReadmePath = 'README.md';
const noDocuments: PackageReadmeDocuments = {};
const noReadmeStack: readonly string[] = [];
const noFiles: readonly string[] = [];
const noBranches: readonly Branch[] = [];

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly error: MonoverseLoadError }
  | { readonly kind: 'success'; readonly analysis: MonorepoAnalysis };

export function Monoverse({
  monorepoPath,
  loadAnalysis,
  reloadNonce = 0,
  renderLaymos,
  selectedPackage: controlledSelected,
  onSelectedPackageChange,
  openPackage: controlledOpen,
  onOpenPackageChange,
  readmeStack: controlledReadmeStack,
  onReadmeStackChange,
  onOpenReadme,
  readmeDocuments = noDocuments,
  loadPackageFiles,
  changes,
  knownFiles = noFiles,
  branches = noBranches,
  baseRef = uncommittedBaseRef,
  onBaseRefChange,
  loadFileDiff,
  className,
}: MonoverseProps) {
  const [gitOptions, setGitOptions] = useState<GitOptions>(defaultGitOptions);
  // How the Package dialog was left, so it reopens the same way after
  // Embedded Laymos closes. Kept per Package; another Package starts fresh.
  const [sourceView, setSourceView] = useState<
    PackageSourceView & { readonly pkg: string }
  >();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [activeKinds, setActiveKinds] = useState<ReadonlySet<DependencyKind>>(
    () => new Set(dependencyKinds),
  );
  // Connections are noisy at rest, so by default a Package has to be hovered
  // or selected before its connections are drawn.
  const [connectionVisibility, setConnectionVisibility] =
    useState<ConnectionVisibility>('on-focus');
  const [hoveredPackage, setHoveredPackage] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selected, setSelected] = useControllable(
    controlledSelected,
    onSelectedPackageChange,
    null,
  );
  const [open, setOpen] = useControllable(
    controlledOpen,
    onOpenPackageChange,
    null,
  );
  const [readmeStack, setReadmeStack] = useControllable(
    controlledReadmeStack,
    onReadmeStackChange,
    noReadmeStack,
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
  const changedFiles = useMemo(
    () =>
      new Map(
        gitOptions.showChanges && changes !== undefined
          ? changes.files.map(({ path, status }) => [path, status] as const)
          : [],
      ),
    [changes, gitOptions.showChanges],
  );
  const changeStatuses = useMemo(
    () =>
      analysis === undefined
        ? undefined
        : packageChangeStatuses(analysis.packages, changedFiles, knownFiles),
    [analysis, changedFiles, knownFiles],
  );
  const view = useMemo(
    () =>
      analysis === undefined || changeStatuses === undefined
        ? undefined
        : buildMonorepoView(analysis, activeKinds, {
            statuses: changeStatuses,
            includeUnchanged:
              !gitOptions.showChanges || gitOptions.includeUnchanged,
          }),
    [analysis, activeKinds, changeStatuses, gitOptions],
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

  if (analysis === undefined || view === undefined)
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

  const byName = new Map(analysis.packages.map((pkg) => [pkg.name, pkg]));
  const selectedPackage =
    selected !== null && byName.has(selected) ? selected : null;
  const selectedPkg =
    selectedPackage === null ? undefined : byName.get(selectedPackage);
  const openPkg = open === null ? undefined : byName.get(open);
  const embedded = openPkg?.hasLaymos ? openPkg : undefined;
  const focus = resolvePackageFocus({
    selectedPackage,
    hoveredPackage,
    edges: view.edges,
  });
  const openLaymos = (name: string) => {
    if (byName.get(name)?.hasLaymos) setOpen(name);
  };
  const openReadme = (name: string) => {
    if (!byName.has(name)) return;
    if (onOpenReadme !== undefined) {
      onOpenReadme(name);
      return;
    }
    setSelected(name);
    setReadmeStack([packageReadmePath]);
  };

  const canvas = (
    <MonorepoCanvas
      className="size-full"
      packages={view.packages}
      view={view}
      selectedPackage={selectedPackage}
      hoveredPackage={hoveredPackage}
      connectionVisibility={connectionVisibility}
      onHoverChange={setHoveredPackage}
      onSelect={setSelected}
      onOpenLaymos={openLaymos}
      onOpenReadme={openReadme}
      onInspect={isMobile ? () => setInspectorOpen(true) : undefined}
    />
  );
  const treeView = (
    <PackageTree
      packages={view.packages}
      decorations={view.decorations}
      focus={focus}
      selectedPackage={selectedPackage}
      onSelect={setSelected}
      onHoverChange={setHoveredPackage}
      onOpenLaymos={openLaymos}
    />
  );
  const detailsView =
    selectedPkg === undefined ? (
      <p className="text-xs text-muted-foreground">
        Select a Package to see its dependencies, dependents, and any Package
        cycle it belongs to.
      </p>
    ) : (
      <PackageDetails
        analysis={analysis}
        pkg={selectedPkg}
        onSelect={setSelected}
        onOpenLaymos={openLaymos}
        onOpenReadme={openReadme}
      />
    );

  return (
    <div className={frame}>
      <MonoverseHeader
        analysis={analysis}
        activeKinds={activeKinds}
        onActiveKindsChange={setActiveKinds}
        connectionVisibility={connectionVisibility}
        onConnectionVisibilityChange={setConnectionVisibility}
        changesMenu={
          changes === undefined ? undefined : (
            <ChangesMenu
              options={gitOptions}
              baseRef={baseRef}
              branches={branches}
              hasChanges={(changeStatuses?.size ?? 0) > 0}
              ownerLabel="packages"
              onOptionsChange={setGitOptions}
              onBaseRefChange={onBaseRefChange}
            />
          )
        }
      />
      {isMobile ? (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-11 items-center gap-2 border-b border-border px-3">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {selectedPkg === undefined
                ? 'Tap a Package to focus it. Double-tap for details.'
                : selectedPkg.name}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-10 shrink-0"
              aria-label="Open Package details"
              onClick={() => setInspectorOpen(true)}
            >
              <PanelRightOpen className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1">{canvas}</div>
          <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[78dvh] gap-0 overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] md:hidden"
            >
              <SheetHeader className="border-b border-border pb-3 pe-14">
                <SheetTitle>
                  {selectedPkg === undefined ? 'Packages' : 'Package details'}
                </SheetTitle>
                <SheetDescription>
                  Select a Package to focus it on the canvas. Open Laymos from
                  the selected Package.
                </SheetDescription>
              </SheetHeader>
              <div
                className={cn('min-h-0 overflow-y-auto p-4', scrollbarStyles)}
              >
                {selectedPkg !== undefined ? (
                  <div className="mb-6 border-b border-border pb-4">
                    {detailsView}
                  </div>
                ) : null}
                {treeView}
              </div>
            </SheetContent>
          </Sheet>
        </section>
      ) : (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          <ResizablePanel defaultSize="75%" minSize="50%">
            {canvas}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="25%" minSize="20%" maxSize="50%">
            <aside className="size-full min-w-0">
              <ResizablePanelGroup orientation="vertical" className="min-h-0">
                <ResizablePanel defaultSize="55%" minSize="20%">
                  <section
                    className={cn(
                      'size-full overflow-y-auto p-3',
                      scrollbarStyles,
                    )}
                  >
                    {treeView}
                  </section>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="45%" minSize="20%">
                  <section
                    className={cn(
                      'size-full overflow-y-auto p-3',
                      scrollbarStyles,
                    )}
                  >
                    {detailsView}
                  </section>
                </ResizablePanel>
              </ResizablePanelGroup>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
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
      {selectedPkg !== undefined && readmeStack.length > 0 && !embedded && (
        <PackageSource
          pkg={selectedPkg}
          readmeStack={readmeStack}
          documents={readmeDocuments}
          onReadmeStackChange={setReadmeStack}
          loadFiles={() => loadPackageFiles(selectedPkg)}
          loadFileDiff={loadFileDiff}
          changedPaths={changedPathsUnder(changedFiles, selectedPkg.path)}
          view={sourceView?.pkg === selectedPkg.name ? sourceView : undefined}
          onViewChange={(view) =>
            setSourceView({ ...view, pkg: selectedPkg.name })
          }
          onOpenLaymos={() => openLaymos(selectedPkg.name)}
          onClose={() => setReadmeStack(noReadmeStack)}
        />
      )}
    </div>
  );
}

export function MonoverseHeader({
  analysis,
  activeKinds,
  onActiveKindsChange,
  connectionVisibility,
  onConnectionVisibilityChange,
  changesMenu,
  className,
}: {
  readonly analysis: MonorepoAnalysis;
  readonly activeKinds: ReadonlySet<DependencyKind>;
  readonly onActiveKindsChange: (kinds: ReadonlySet<DependencyKind>) => void;
  readonly connectionVisibility: ConnectionVisibility;
  readonly onConnectionVisibilityChange: (
    visibility: ConnectionVisibility,
  ) => void;
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
      {analysis.violations.length > 0 && (
        <Badge variant="destructive" className="tabular-nums">
          <TriangleAlert />
          {analysis.violations.length}{' '}
          {analysis.violations.length === 1 ? 'cycle' : 'cycles'}
        </Badge>
      )}
      <div className="ms-auto flex items-center gap-2">
        {changesMenu}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="View"
            title="How connections are drawn"
            className="flex h-8 items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 font-mono text-xs text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Eye className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="hidden truncate lowercase md:inline">
              {connectionVisibility === 'on-focus'
                ? 'Connections on focus'
                : 'Connections always'}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 font-mono">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[10px] lowercase">
                View
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                className="text-xs lowercase"
                checked={connectionVisibility === 'on-focus'}
                onCheckedChange={(checked) =>
                  onConnectionVisibilityChange(checked ? 'on-focus' : 'always')
                }
              >
                Only show on package focus
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
export type {
  PackageReadmeDocument,
  PackageReadmeDocuments,
} from '../package-readme';
