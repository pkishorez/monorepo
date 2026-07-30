import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleX,
  Clock,
  ListChecks,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  SkipForward,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import type {
  LaymosTestEvidence,
  TestAssertionEvidence,
  TestCaseReport,
  TestErrorReport,
  TestModuleReport,
  TestStatus,
  TestSuiteReport,
  TestTraceSpan,
  TestValue,
} from 'laymos/report';

import { Button } from '#components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '#components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Switch } from '#components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import {
  TraceDock,
  type TraceDockSettings,
} from '../otel-trace-viewer/trace-dock';
import {
  formatDuration as formatTraceDuration,
  groupByTrace,
  type OtelSpan,
  type TraceGroup,
} from '../otel-trace-viewer/trace-model';
import { StatusDot } from '../otel-trace-viewer/status';
import { AutoValue } from './auto-value';
import { SuiteDocumentation } from './suite-documentation';
import { TestDocumentation } from './test-documentation';
import type { LaymosTestsProps, LaymosTestSelection } from './types';
import { ValueDiff } from './value-diff';

type Authorship = 'laymos' | 'vitest';
type StatusFilter = 'all' | 'failed' | 'skipped' | 'passed';
type Selection = LaymosTestSelection;

type SuiteMember = {
  readonly module: TestModuleReport;
  readonly suite: TestSuiteReport;
};

type LogicalSuite = {
  readonly id: string;
  readonly authorship: Authorship;
  readonly name: string;
  readonly path: readonly string[];
  readonly members: readonly SuiteMember[];
  readonly cases: readonly LocatedCase[];
  readonly suites: readonly LogicalSuite[];
  readonly status: TestStatus;
  readonly description?: string;
  readonly documentation: readonly string[];
};

type ResolvedSelection =
  | { readonly kind: 'group'; readonly group: Group }
  | {
      readonly kind: 'module';
      readonly authorship: Authorship;
      readonly module: TestModuleReport;
    }
  | {
      readonly kind: 'suite';
      readonly authorship: Authorship;
      readonly group: Group;
      readonly suite: LogicalSuite;
    }
  | {
      readonly kind: 'case';
      readonly authorship: Authorship;
      readonly module: TestModuleReport;
      readonly testCase: TestCaseReport;
      readonly suitePath: readonly TestSuiteReport[];
    };

type Group = {
  readonly id: Authorship;
  readonly label: string;
  readonly modules: readonly TestModuleReport[];
};

export function LaymosTestsWorkspace({
  report,
  selectedTest,
  onSelectedTestChange,
  onRunTests,
  renderSource,
  running = false,
  navigationWidth = 320,
  onNavigationWidthChange,
  navigationCollapsed = false,
  onNavigationCollapsedChange,
  traceSidebarWidth,
  onTraceSidebarWidthChange,
  traceShowLogs,
  onTraceShowLogsChange,
  className,
}: LaymosTestsProps) {
  const modules = report?.modules ?? [];
  const groups = useMemo(() => createGroups(modules), [modules]);
  const [internalSelection, setInternalSelection] = useState<Selection>();
  const selection =
    selectedTest === undefined
      ? internalSelection
      : (selectedTest ?? undefined);
  const resolved = useMemo(
    () => resolveSelection(groups, selection),
    [groups, selection],
  );
  const [query, setQuery] = useState('');
  const [pageStatusFilter, setPageStatusFilter] = useState<StatusFilter>('all');
  const [navigationStatusFilter, setNavigationStatusFilter] =
    useState<StatusFilter>('all');
  const [expandAll, setExpandAll] = useState(true);
  const expanded = useMemo(
    () =>
      expandAll
        ? allExpansionIds(groups)
        : selection
          ? selectionExpansionIds(groups, selection)
          : [],
    [expandAll, groups, selection],
  );
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [internalTraceSidebarWidth, setInternalTraceSidebarWidth] =
    useState(360);
  const [internalTraceShowLogs, setInternalTraceShowLogs] = useState(false);
  const resolvedTraceSidebarWidth =
    traceSidebarWidth ?? internalTraceSidebarWidth;
  const resolvedTraceShowLogs = traceShowLogs ?? internalTraceShowLogs;
  const previousReport = useRef(report);
  const mainScroll = useRef<HTMLElement>(null);

  useEffect(() => {
    if (previousReport.current === report) return;
    previousReport.current = report;
    setPageStatusFilter('all');
    setNavigationStatusFilter('all');
  }, [report]);

  useEffect(() => {
    if (
      report !== undefined &&
      selection !== undefined &&
      resolved === undefined
    ) {
      setInternalSelection(undefined);
      onSelectedTestChange?.(null);
    }
  }, [onSelectedTestChange, report, resolved, selection]);

  const choose = (next?: Selection) => {
    setInternalSelection(next);
    onSelectedTestChange?.(next ?? null);
    setMobileNavigationOpen(false);
    mainScroll.current?.scrollTo({ top: 0 });
  };

  return (
    <section
      className={cn(
        'relative flex min-h-0 overflow-hidden rounded-lg border bg-background',
        className,
      )}
      aria-label="Test results"
    >
      <main ref={mainScroll} className="min-w-0 flex-1 overflow-y-auto">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 z-20 shadow-md md:hidden"
          onClick={() => setMobileNavigationOpen(true)}
        >
          <PanelRightOpen aria-hidden />
          Tests
        </Button>
        {resolved === undefined ? (
          <RunDashboard
            report={report}
            groups={groups}
            running={running}
            statusFilter={pageStatusFilter}
            onStatusFilterChange={setPageStatusFilter}
            onRun={onRunTests}
            onSelect={choose}
            onRevealGroup={(authorship) =>
              choose({ kind: 'group', authorship })
            }
          />
        ) : resolved.kind === 'group' ? (
          <GroupOverview
            group={resolved.group}
            groups={groups}
            statusFilter={pageStatusFilter}
            onStatusFilterChange={setPageStatusFilter}
            onSelect={choose}
          />
        ) : resolved.kind === 'case' ? (
          <CaseDetail
            selection={resolved}
            onSelect={choose}
            renderSource={renderSource}
            groups={groups}
            traceSidebarWidth={resolvedTraceSidebarWidth}
            onTraceSidebarWidthChange={
              onTraceSidebarWidthChange ?? setInternalTraceSidebarWidth
            }
            traceShowLogs={resolvedTraceShowLogs}
            onTraceShowLogsChange={
              onTraceShowLogsChange ?? setInternalTraceShowLogs
            }
          />
        ) : (
          <BranchOverview
            selection={resolved}
            groups={groups}
            statusFilter={pageStatusFilter}
            onStatusFilterChange={setPageStatusFilter}
            onSelect={choose}
          />
        )}
      </main>

      {navigationCollapsed ? (
        <button
          type="button"
          className="hidden h-full w-10 shrink-0 flex-col items-center gap-2 border-l bg-muted/10 py-3 text-muted-foreground hover:bg-muted/30 hover:text-foreground md:flex"
          aria-label="Show tests"
          title="Show tests"
          onClick={() => onNavigationCollapsedChange?.(false)}
        >
          <ChevronRight className="size-3.5" aria-hidden />
          <ListChecks className="size-3.5" aria-hidden />
          <span className="mt-1 [writing-mode:vertical-rl] text-[10px] uppercase tracking-wider">
            Tests
          </span>
        </button>
      ) : (
        <Navigation
          groups={groups}
          selection={selection}
          query={query}
          statusFilter={navigationStatusFilter}
          expanded={expanded}
          expandAll={expandAll}
          running={running}
          width={navigationWidth}
          mobileOpen={mobileNavigationOpen}
          onQueryChange={setQuery}
          onStatusFilterChange={setNavigationStatusFilter}
          onExpandAllChange={setExpandAll}
          onSelect={choose}
          onRun={onRunTests}
          onCollapse={() => onNavigationCollapsedChange?.(true)}
          onMobileClose={() => setMobileNavigationOpen(false)}
          onWidthChange={onNavigationWidthChange}
        />
      )}
    </section>
  );
}

function Navigation({
  groups,
  selection,
  query,
  statusFilter,
  expanded,
  expandAll,
  running,
  width,
  mobileOpen,
  onQueryChange,
  onStatusFilterChange,
  onExpandAllChange,
  onSelect,
  onRun,
  onCollapse,
  onMobileClose,
  onWidthChange,
}: {
  readonly groups: readonly Group[];
  readonly selection?: Selection;
  readonly query: string;
  readonly statusFilter: StatusFilter;
  readonly expanded: readonly string[];
  readonly expandAll: boolean;
  readonly running: boolean;
  readonly width: number;
  readonly mobileOpen: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onStatusFilterChange: (filter: StatusFilter) => void;
  readonly onExpandAllChange: (expanded: boolean) => void;
  readonly onSelect: (selection?: Selection) => void;
  readonly onRun?: () => void;
  readonly onCollapse: () => void;
  readonly onMobileClose: () => void;
  readonly onWidthChange?: (width: number) => void;
}) {
  const expandedSet = new Set(expanded);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return (
    <aside
      className={cn(
        'relative z-30 h-full shrink-0 border-l bg-background',
        'max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:w-[min(90vw,24rem)] max-md:shadow-xl',
        !mobileOpen && 'max-md:hidden',
      )}
      style={{ width }}
    >
      {onWidthChange && (
        <ResizeHandle width={width} onWidthChange={onWidthChange} />
      )}
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <button
            type="button"
            className={cn(
              'min-w-0 flex-1 truncate text-left text-sm font-semibold',
              selection === undefined && 'text-primary',
            )}
            onClick={() => onSelect(undefined)}
          >
            All tests
          </button>
          {onRun && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Run tests"
              title="Run tests"
              disabled={running}
              onClick={onRun}
            >
              <RefreshCw
                className={cn(running && 'animate-spin')}
                aria-hidden
              />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="md:hidden"
            aria-label="Close test navigation"
            onClick={onMobileClose}
          >
            <PanelRightClose aria-hidden />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="max-md:hidden"
            aria-label="Minimize test navigation"
            title="Minimize test navigation"
            onClick={onCollapse}
          >
            <PanelRightClose aria-hidden />
          </Button>
        </header>
        <div className="shrink-0 space-y-2 border-b p-2">
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <label className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search tests"
                className="h-8 w-full rounded-md border bg-transparent pl-7 pr-2 text-xs outline-none focus:border-foreground/30"
              />
            </label>
            <select
              aria-label="Filter tests by status"
              value={statusFilter}
              onChange={(event) =>
                onStatusFilterChange(event.target.value as StatusFilter)
              }
              className="h-8 min-w-0 rounded-md border bg-background px-2 text-xs"
            >
              <option value="all">All</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
              <option value="passed">Passed</option>
            </select>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
            Recursively expand all
            <Switch
              size="sm"
              checked={expandAll}
              onCheckedChange={onExpandAllChange}
            />
          </label>
        </div>
        <nav
          aria-label="Tests"
          className={cn('min-h-0 flex-1 overflow-y-auto p-2', scrollbarStyles)}
        >
          {groups.length === 1 && groups[0] ? (
            <SuiteFirstNavigation
              group={groups[0]}
              selection={selection}
              query={normalizedQuery}
              statusFilter={statusFilter}
              expanded={expanded}
              onSelect={onSelect}
            />
          ) : (
            groups.map((group) => {
              const id = `group:${group.id}`;
              const open =
                expandedSet.has(id) || selection?.authorship === group.id;
              const groupCases = group.modules.flatMap(moduleCases);
              return (
                <section key={group.id} className="mb-2">
                  <TreeRow
                    expandable
                    expanded={open}
                    status={combinedStatus(
                      groupCases.map(({ status }) => status),
                    )}
                    label={group.label}
                    count={groupCases.length}
                    active={
                      selection?.kind === 'group' &&
                      selection.authorship === group.id
                    }
                    depth={0}
                    onClick={() =>
                      onSelect({ kind: 'group', authorship: group.id })
                    }
                  />
                  {open && (
                    <div className="ml-2 border-l pl-1">
                      <SuiteFirstNavigation
                        group={group}
                        selection={selection}
                        query={normalizedQuery}
                        statusFilter={statusFilter}
                        expanded={expanded}
                        onSelect={onSelect}
                      />
                    </div>
                  )}
                </section>
              );
            })
          )}
        </nav>
      </div>
    </aside>
  );
}

function SuiteFirstNavigation({
  group,
  selection,
  query,
  statusFilter,
  expanded,
  onSelect,
}: {
  readonly group: Group;
  readonly selection?: Selection;
  readonly query: string;
  readonly statusFilter: StatusFilter;
  readonly expanded: readonly string[];
  readonly onSelect: (selection: Selection) => void;
}) {
  const suites = createLogicalSuites(group);
  const ungrouped = group.modules.flatMap((module) =>
    module.cases.map((testCase) => ({
      authorship: group.id,
      module,
      testCase,
    })),
  );
  return (
    <>
      {suites.map((suite) => (
        <SuiteNavigation
          key={suite.id}
          suite={suite}
          selection={selection}
          query={query}
          statusFilter={statusFilter}
          depth={0}
          expanded={expanded}
          onSelect={onSelect}
        />
      ))}
      {ungrouped.length > 0 && (
        <UngroupedNavigation
          authorship={group.id}
          cases={ungrouped}
          selection={selection}
          query={query}
          statusFilter={statusFilter}
          expanded={expanded}
          onSelect={onSelect}
        />
      )}
      {group.modules.some((module) => module.errors.length > 0) && (
        <div className="mt-2 px-2 py-1 text-[10px] font-medium text-destructive">
          Collection errors
        </div>
      )}
    </>
  );
}

function UngroupedNavigation(props: {
  readonly authorship: Authorship;
  readonly cases: readonly LocatedCase[];
  readonly selection?: Selection;
  readonly query: string;
  readonly statusFilter: StatusFilter;
  readonly expanded: readonly string[];
  readonly onSelect: (selection: Selection) => void;
}) {
  const { authorship, selection, query, statusFilter } = props;
  const cases = props.cases.filter(
    ({ module, testCase }) =>
      isSelectedCase(selection, authorship, module.id, testCase.id) ||
      caseVisible(testCase, query, statusFilter),
  );
  if (cases.length === 0) return null;
  const id = `${authorship}:ungrouped`;
  const containsSelection =
    selection?.kind === 'case' &&
    selection.authorship === authorship &&
    props.cases.some(
      ({ module, testCase }) =>
        module.id === selection.moduleId && testCase.id === selection.caseId,
    );
  const open = props.expanded.includes(id) || containsSelection;
  return (
    <div>
      <TreeRow
        expandable
        expanded={open}
        status={combinedStatus(cases.map(({ testCase }) => testCase.status))}
        label="Ungrouped"
        count={cases.length}
        active={false}
        depth={0}
        onClick={() => {
          const firstCase = props.cases[0];
          if (firstCase) {
            props.onSelect({
              kind: 'case',
              authorship,
              moduleId: firstCase.module.id,
              caseId: firstCase.testCase.id,
            });
          }
        }}
      />
      {open && (
        <div className="ml-2 border-l pl-1">
          {cases.map(({ module, testCase }) => (
            <CaseNavigation
              key={`${module.id}:${testCase.id}`}
              authorship={authorship}
              module={module}
              testCase={testCase}
              selection={selection}
              depth={1}
              onSelect={props.onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuiteNavigation(props: {
  readonly suite: LogicalSuite;
  readonly selection?: Selection;
  readonly query: string;
  readonly statusFilter: StatusFilter;
  readonly expanded: readonly string[];
  readonly onSelect: (selection: Selection) => void;
  readonly depth: number;
}) {
  const { suite, selection, query, statusFilter, depth } = props;
  const containsSelection = logicalSuiteContainsSelection(suite, selection);
  if (!containsSelection && !logicalSuiteVisible(suite, query, statusFilter))
    return null;
  const open = props.expanded.includes(suite.id) || containsSelection;
  return (
    <div>
      <TreeRow
        expandable
        expanded={open}
        status={suite.status}
        label={suite.name}
        count={logicalSuiteCases(suite).length}
        active={
          selection?.kind === 'suite' &&
          selection.authorship === suite.authorship &&
          pathsEqual(selection.suitePath, suite.path)
        }
        depth={depth}
        onClick={() =>
          props.onSelect({
            kind: 'suite',
            authorship: suite.authorship,
            suitePath: suite.path,
          })
        }
      />
      {open && (
        <div className="ml-2 border-l pl-1">
          {suite.cases
            .filter(
              ({ module, testCase }) =>
                isSelectedCase(
                  selection,
                  suite.authorship,
                  module.id,
                  testCase.id,
                ) || caseVisible(testCase, query, statusFilter),
            )
            .map(({ module, testCase }) => (
              <CaseNavigation
                key={`${module.id}:${testCase.id}`}
                authorship={suite.authorship}
                module={module}
                testCase={testCase}
                selection={selection}
                depth={depth + 1}
                onSelect={props.onSelect}
              />
            ))}
          {suite.suites.map((child) => (
            <SuiteNavigation
              key={child.id}
              {...props}
              suite={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseNavigation({
  authorship,
  module,
  testCase,
  selection,
  depth,
  onSelect,
}: {
  readonly authorship: Authorship;
  readonly module: TestModuleReport;
  readonly testCase: TestCaseReport;
  readonly selection?: Selection;
  readonly depth: number;
  readonly onSelect: (selection: Selection) => void;
}) {
  return (
    <TreeRow
      status={testCase.status}
      label={testCase.name}
      active={
        selection?.kind === 'case' &&
        selection.authorship === authorship &&
        selection.moduleId === module.id &&
        selection.caseId === testCase.id
      }
      depth={depth}
      onClick={() =>
        onSelect({
          kind: 'case',
          authorship,
          moduleId: module.id,
          caseId: testCase.id,
        })
      }
    />
  );
}

function TreeRow({
  expandable = false,
  expanded = false,
  status,
  label,
  suffix,
  count,
  active,
  depth,
  onClick,
  onContextMenu,
}: {
  readonly expandable?: boolean;
  readonly expanded?: boolean;
  readonly status: TestStatus;
  readonly label: string;
  readonly suffix?: string;
  readonly count?: number;
  readonly active: boolean;
  readonly depth: number;
  readonly onClick: () => void;
  readonly onContextMenu?: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      aria-expanded={expandable ? expanded : undefined}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
      style={{ paddingLeft: `${Math.min(depth, 4) * 4 + 4}px` }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span className="grid size-3.5 shrink-0 place-items-center">
        {expandable && (
          <ChevronRight
            className={cn(
              'size-3 transition-transform',
              expanded && 'rotate-90',
            )}
            aria-hidden
          />
        )}
      </span>
      <StatusIcon status={status} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate" title={label}>
            {label}
          </span>
          {suffix && (
            <span className="max-w-20 truncate text-[9px] text-muted-foreground/70">
              {suffix}
            </span>
          )}
          {count !== undefined && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function RunDashboard({
  report,
  groups,
  running,
  statusFilter,
  onStatusFilterChange,
  onRun,
  onSelect,
  onRevealGroup,
}: {
  readonly report: LaymosTestsProps['report'];
  readonly groups: readonly Group[];
  readonly running: boolean;
  readonly statusFilter: StatusFilter;
  readonly onStatusFilterChange: (filter: StatusFilter) => void;
  readonly onRun?: () => void;
  readonly onSelect: (selection: Selection) => void;
  readonly onRevealGroup: (authorship: Authorship) => void;
}) {
  if (!report) {
    return (
      <div className="flex h-full flex-col p-6 lg:p-10">
        <WorkspaceBreadcrumbs groups={groups} onSelect={() => undefined} />
        <div className="grid min-h-0 flex-1 place-items-center text-center">
          <div>
            <p className="text-sm font-medium">
              {running ? 'Running tests…' : 'No test results'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Results appear here after the first test run.
            </p>
            {onRun && !running && (
              <Button className="mt-4" size="sm" onClick={onRun}>
                <RefreshCw aria-hidden />
                Run tests
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
  const locatedCases = locateCases(groups);
  const cases = locatedCases.map(({ testCase }) => testCase);
  const failed = locatedCases.filter(
    ({ testCase }) => testCase.status === 'failed',
  );
  const collectionErrors = report.modules.flatMap((module) =>
    module.errors.map((error) => ({ module, error })),
  );
  const visibleCases =
    statusFilter === 'all'
      ? []
      : locatedCases.filter(({ testCase }) =>
          statusMatches(testCase.status, statusFilter),
        );
  const slowest = locatedCases
    .filter(({ authorship }) => authorship === 'laymos')
    .sort((a, b) => b.testCase.duration - a.testCase.duration)
    .slice(0, 5);
  const topLevelSuites =
    groups.length === 1 && groups[0] ? createLogicalSuites(groups[0]) : [];
  const hasBreakdown = groups.length > 1 || topLevelSuites.length > 0;
  return (
    <div className="w-full space-y-8 p-6 lg:p-10">
      <WorkspaceBreadcrumbs groups={groups} onSelect={() => undefined} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Test run
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {report.status === 'passed'
              ? 'Everything passed'
              : 'Tests need attention'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cases.length} tests completed in {formatDuration(report.duration)}
            {running ? ' · Running again…' : ''}
          </p>
        </div>
        {onRun && (
          <Button size="sm" disabled={running} onClick={onRun}>
            <RefreshCw className={cn(running && 'animate-spin')} aria-hidden />
            {running ? 'Running…' : 'Run again'}
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Total"
          value={cases.length}
          icon={<ListChecks />}
          active={statusFilter === 'all'}
          onClick={() => onStatusFilterChange('all')}
        />
        <Metric
          label="Passed"
          value={countStatus(cases, 'passed')}
          icon={<Check className="text-emerald-600" />}
          active={statusFilter === 'passed'}
          onClick={() => onStatusFilterChange('passed')}
        />
        <Metric
          label="Failed"
          value={countStatus(cases, 'failed')}
          icon={<CircleX className="text-destructive" />}
          active={statusFilter === 'failed'}
          onClick={() => onStatusFilterChange('failed')}
        />
        <Metric
          label="Skipped"
          value={countStatus(cases, 'skipped')}
          icon={<SkipForward />}
          active={statusFilter === 'skipped'}
          onClick={() => onStatusFilterChange('skipped')}
        />
        <Metric
          label="Pending"
          value={countStatus(cases, 'pending')}
          icon={<Circle className="text-amber-500" />}
          active={statusFilter === 'skipped'}
          onClick={() => onStatusFilterChange('skipped')}
        />
      </div>

      {statusFilter !== 'all' && (
        <DashboardSection title={`${filterLabel(statusFilter)} tests`}>
          <CompactCaseList cases={visibleCases} onSelect={onSelect} />
        </DashboardSection>
      )}

      {(failed.length > 0 ||
        collectionErrors.length > 0 ||
        report.unhandledErrors.length > 0) && (
        <DashboardSection title="Needs attention">
          <div className="divide-y rounded-lg border">
            {failed.map((located) => (
              <CompactCaseRow
                key={`${located.module.id}:${located.testCase.id}`}
                located={located}
                onSelect={onSelect}
              />
            ))}
            {collectionErrors.map(({ module, error }, index) => (
              <ErrorRow
                key={`${module.id}:${index}`}
                label={`${module.name}: ${error.message}`}
                error={error}
              />
            ))}
            {report.unhandledErrors.map((error, index) => (
              <ErrorRow
                key={`unhandled:${index}`}
                label={`Unhandled: ${error.message}`}
                error={error}
              />
            ))}
          </div>
        </DashboardSection>
      )}

      <div
        className={cn(
          'grid gap-6',
          hasBreakdown && slowest.length > 0 && 'lg:grid-cols-2',
        )}
      >
        {hasBreakdown && (
          <DashboardSection title="Breakdown">
            <div className="space-y-2">
              {groups.length > 1
                ? groups.map((group) => {
                    const groupCases = group.modules.flatMap(moduleCases);
                    return (
                      <BreakdownRow
                        key={group.id}
                        label={group.label}
                        cases={groupCases}
                        onClick={() => onRevealGroup(group.id)}
                      />
                    );
                  })
                : topLevelSuites.map((suite) => (
                    <BreakdownRow
                      key={suite.id}
                      label={suite.name}
                      cases={logicalSuiteCases(suite)}
                      onClick={() =>
                        onSelect({
                          kind: 'suite',
                          authorship: suite.authorship,
                          suitePath: suite.path,
                        })
                      }
                    />
                  ))}
            </div>
          </DashboardSection>
        )}
        {slowest.length > 0 && (
          <DashboardSection title="Slowest tests">
            <CompactCaseList cases={slowest} onSelect={onSelect} />
          </DashboardSection>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  cases,
  onClick,
}: {
  readonly label: string;
  readonly cases: readonly TestCaseReport[];
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/30"
      onClick={onClick}
    >
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">
        {countStatus(cases, 'passed')} passed · {countStatus(cases, 'failed')}{' '}
        failed
      </span>
    </button>
  );
}

function WorkspaceBreadcrumbs({
  groups,
  selection,
  onSelect,
}: {
  readonly groups: readonly Group[];
  readonly selection?: ResolvedSelection;
  readonly onSelect: (selection?: Selection) => void;
}) {
  const items = buildBreadcrumbs(groups, selection);

  return (
    <nav
      aria-label="Test breadcrumb"
      className="flex min-h-8 items-center gap-1 overflow-x-auto text-xs"
    >
      {items.map((item, index) => (
        <span
          key={`${item.label}:${index}`}
          className="flex shrink-0 items-center gap-1"
        >
          {index > 0 && (
            <ChevronRight
              className="size-3 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
          <BreadcrumbCrumb
            item={item}
            current={selection}
            active={index === items.length - 1}
            onSelect={onSelect}
          />
        </span>
      ))}
    </nav>
  );
}

type BreadcrumbOption = {
  readonly label: string;
  readonly description: string;
  readonly kind: 'group' | 'suite' | 'test';
  readonly status: TestStatus;
  readonly selection: Selection;
};

type BreadcrumbItem = {
  readonly label: string;
  readonly selection?: Selection;
  readonly options: readonly BreadcrumbOption[];
};

function buildBreadcrumbs(
  groups: readonly Group[],
  selection?: ResolvedSelection,
): BreadcrumbItem[] {
  const onlyGroup = groups.length === 1 ? groups[0] : undefined;
  const groupOptions: BreadcrumbOption[] = groups.map((group) => ({
    label: group.label,
    description: `${group.modules.flatMap(moduleCases).length} tests`,
    kind: 'group',
    status: combinedStatus(
      group.modules.flatMap(moduleCases).map((c) => c.status),
    ),
    selection: { kind: 'group', authorship: group.id },
  }));
  const items: BreadcrumbItem[] = [
    {
      label: 'All tests',
      options: onlyGroup ? breadcrumbGroupChildren(onlyGroup) : groupOptions,
    },
  ];
  if (selection) {
    const authorship =
      selection.kind === 'group' ? selection.group.id : selection.authorship;
    const group = groups.find(({ id }) => id === authorship);
    if (!group) return items;
    if (!onlyGroup) {
      items.push({
        label: authorship === 'laymos' ? 'laymos' : 'Vitest',
        selection: { kind: 'group', authorship },
        options: breadcrumbGroupChildren(group),
      });
    }
    if (selection.kind !== 'group') {
      if (selection.kind === 'module') {
        items.push({
          label: selection.module.name,
          selection: {
            kind: 'module',
            authorship,
            moduleId: selection.module.id,
          },
          options: selection.module.cases.map((testCase) =>
            breadcrumbCaseOption(authorship, selection.module, testCase),
          ),
        });
      }
      const suitePath =
        selection.kind === 'suite'
          ? selection.suite.path
          : selection.kind === 'case'
            ? selection.suitePath.map(({ name }) => name)
            : [];
      for (const [index, suiteName] of suitePath.entries()) {
        const path = suitePath.slice(0, index + 1);
        const suite = findBreadcrumbSuite(group, path);
        items.push({
          label: suiteName,
          selection: {
            kind: 'suite',
            authorship,
            suitePath: path,
          },
          options: suite ? breadcrumbSuiteChildren(suite) : [],
        });
      }
      if (selection.kind === 'case') {
        const parentSuite = findBreadcrumbSuite(
          group,
          selection.suitePath.map(({ name }) => name),
        );
        const siblings = parentSuite
          ? parentSuite.cases.map(({ module, testCase }) =>
              breadcrumbCaseOption(authorship, module, testCase),
            )
          : selection.module.cases.map((testCase) =>
              breadcrumbCaseOption(authorship, selection.module, testCase),
            );
        items.push({
          label: selection.testCase.name,
          selection: {
            kind: 'case',
            authorship,
            moduleId: selection.module.id,
            caseId: selection.testCase.id,
          },
          options: siblings,
        });
      }
    }
  }
  return items;
}

function breadcrumbGroupChildren(group: Group): BreadcrumbOption[] {
  const suites = createLogicalSuites(group).map(breadcrumbSuiteOption);
  const cases = group.modules.flatMap((module) =>
    module.cases.map((testCase) =>
      breadcrumbCaseOption(group.id, module, testCase),
    ),
  );
  return [...suites, ...cases];
}

function breadcrumbSuiteChildren(suite: LogicalSuite): BreadcrumbOption[] {
  return [
    ...suite.suites.map(breadcrumbSuiteOption),
    ...suite.cases.map(({ authorship, module, testCase }) =>
      breadcrumbCaseOption(authorship, module, testCase),
    ),
  ];
}

function breadcrumbSuiteOption(suite: LogicalSuite): BreadcrumbOption {
  return {
    label: suite.name,
    description:
      suite.description ?? `${logicalSuiteCases(suite).length} tests`,
    kind: 'suite',
    status: suite.status,
    selection: {
      kind: 'suite',
      authorship: suite.authorship,
      suitePath: suite.path,
    },
  };
}

function breadcrumbCaseOption(
  authorship: Authorship,
  module: TestModuleReport,
  testCase: TestCaseReport,
): BreadcrumbOption {
  return {
    label: testCase.name,
    description:
      testCase.evidence?.description ??
      `${statusLabel(testCase.status)} · ${formatDuration(testCase.duration)}`,
    kind: 'test',
    status: testCase.status,
    selection: {
      kind: 'case',
      authorship,
      moduleId: module.id,
      caseId: testCase.id,
    },
  };
}

function findBreadcrumbSuite(
  group: Group,
  path: readonly string[],
): LogicalSuite | undefined {
  let level = createLogicalSuites(group);
  let found: LogicalSuite | undefined;
  for (const name of path) {
    found = level.find((suite) => suite.name === name);
    if (!found) return undefined;
    level = found.suites;
  }
  return found;
}

function selectionKey(selection?: Selection): string {
  if (!selection) return 'all';
  if (selection.kind === 'group') {
    return `group:${selection.authorship}`;
  }
  if (selection.kind === 'module') {
    return `module:${selection.authorship}:${selection.moduleId}`;
  }
  if (selection.kind === 'suite') {
    return `suite:${selection.authorship}:${selection.suitePath.join('/')}`;
  }
  return `case:${selection.authorship}:${selection.moduleId}:${selection.caseId}`;
}

function BreadcrumbCrumb({
  item,
  current,
  active,
  onSelect,
}: {
  readonly item: BreadcrumbItem;
  readonly current?: ResolvedSelection;
  readonly active: boolean;
  readonly onSelect: (selection?: Selection) => void;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const visible =
    normalized.length === 0
      ? item.options
      : item.options.filter(
          ({ label: optionLabel, description }) =>
            optionLabel.toLocaleLowerCase().includes(normalized) ||
            description.toLocaleLowerCase().includes(normalized),
        );
  const currentSelection: Selection | undefined =
    current?.kind === 'group'
      ? { kind: 'group', authorship: current.group.id }
      : current?.kind === 'module'
        ? {
            kind: 'module',
            authorship: current.authorship,
            moduleId: current.module.id,
          }
        : current?.kind === 'suite'
          ? {
              kind: 'suite',
              authorship: current.authorship,
              suitePath: current.suite.path,
            }
          : current?.kind === 'case'
            ? {
                kind: 'case',
                authorship: current.authorship,
                moduleId: current.module.id,
                caseId: current.testCase.id,
              }
            : undefined;

  const button = (
    <button
      type="button"
      className={cn(
        'max-w-56 truncate rounded px-1.5 py-1 hover:bg-muted',
        active
          ? 'font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
      title={
        item.options.length > 0
          ? `${item.label} — right-click to browse`
          : item.label
      }
      onClick={() => onSelect(item.selection)}
    >
      {item.label}
    </button>
  );

  if (item.options.length === 0) return button;

  return (
    <ContextMenu onOpenChange={(open) => !open && setQuery('')}>
      <ContextMenuTrigger render={button} />
      <ContextMenuContent className="w-[28rem] max-w-[calc(100vw-2rem)]">
        {item.options.length >= 10 && (
          <div className="p-1" onKeyDown={(event) => event.stopPropagation()}>
            <label className="relative block">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="h-8 w-full rounded-md border bg-transparent pl-7 pr-2 text-xs outline-none focus:border-foreground/30"
              />
            </label>
          </div>
        )}
        {visible.map((option) => {
          const serial = item.options.indexOf(option) + 1;
          return (
            <ContextMenuItem
              key={selectionKey(option.selection)}
              className="items-start gap-2.5 py-2.5"
              onClick={() => onSelect(option.selection)}
            >
              <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground/60">
                {serial}
              </span>
              <span className="mt-0.5 shrink-0">
                <StatusIcon status={option.status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-medium leading-5">
                    {option.label}
                  </span>
                  <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    {option.kind}
                  </span>
                </span>
                <span className="mt-0.5 block whitespace-pre-line break-words text-[11px] leading-4 text-muted-foreground">
                  {option.description}
                </span>
              </span>
              {selectionKey(option.selection) ===
                selectionKey(currentSelection) && (
                <Check
                  className="mt-0.5 size-3.5 shrink-0 text-primary"
                  aria-label="Current"
                />
              )}
            </ContextMenuItem>
          );
        })}
        {visible.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No matches
          </p>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function GroupOverview({
  group,
  groups,
  statusFilter,
  onStatusFilterChange,
  onSelect,
}: {
  readonly group: Group;
  readonly groups: readonly Group[];
  readonly statusFilter: StatusFilter;
  readonly onStatusFilterChange: (filter: StatusFilter) => void;
  readonly onSelect: (selection?: Selection) => void;
}) {
  const cases = group.modules.flatMap(moduleCases);
  const suites = createLogicalSuites(group);
  const visibleSuites = suites.filter((suite) =>
    statusMatchesAny(logicalSuiteCases(suite), statusFilter),
  );
  const visibleDirectCases = group.modules.flatMap((module) =>
    module.cases
      .filter((testCase) => statusMatches(testCase.status, statusFilter))
      .map((testCase) => ({ module, testCase })),
  );
  return (
    <div className="w-full p-6 lg:p-10">
      <WorkspaceBreadcrumbs
        groups={groups}
        selection={{ kind: 'group', group }}
        onSelect={onSelect}
      />
      <TestPageHeader
        title={group.label}
        status={combinedStatus(cases.map(({ status }) => status))}
        cases={cases}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
      />
      <div className="mt-8 space-y-2">
        {visibleSuites.map((suite) => (
          <BranchRow
            key={suite.id}
            label={suite.name}
            description={suite.description}
            meta={`${logicalSuiteCases(suite).length} tests`}
            status={suite.status}
            onClick={() =>
              onSelect({
                kind: 'suite',
                authorship: group.id,
                suitePath: suite.path,
              })
            }
          />
        ))}
        {visibleDirectCases.map(({ module, testCase }) => (
          <BranchRow
            key={`${module.id}:${testCase.id}`}
            label={testCase.name}
            description={testCase.evidence?.description}
            meta={formatDuration(testCase.duration)}
            status={testCase.status}
            onClick={() =>
              onSelect({
                kind: 'case',
                authorship: group.id,
                moduleId: module.id,
                caseId: testCase.id,
              })
            }
          />
        ))}
        {visibleSuites.length === 0 && visibleDirectCases.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No matching tests.
          </p>
        )}
      </div>
    </div>
  );
}

function BranchRow({
  label,
  description,
  meta,
  status,
  onClick,
}: {
  readonly label: string;
  readonly description?: string;
  readonly meta: string;
  readonly status: TestStatus;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left hover:bg-muted/30"
      onClick={onClick}
    >
      <span className="mt-0.5">
        <StatusIcon status={status} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {description && (
          <span className="mt-0.5 block whitespace-pre-line text-xs leading-5 text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <span className="mt-0.5 text-[10px] text-muted-foreground">{meta}</span>
      <ChevronRight className="mt-0.5 size-3.5 text-muted-foreground" />
    </button>
  );
}

function TestPageHeader({
  title,
  status,
  description,
  cases,
  statusFilter,
  onStatusFilterChange,
}: {
  readonly title: string;
  readonly status: TestStatus;
  readonly description?: string;
  readonly cases: readonly TestCaseReport[];
  readonly statusFilter: StatusFilter;
  readonly onStatusFilterChange: (filter: StatusFilter) => void;
}) {
  return (
    <header className="mt-4">
      <div className="flex min-h-8 items-center gap-2">
        <StatusIcon status={status} />
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <p
        className={cn(
          'mt-2 min-h-5 max-w-3xl whitespace-pre-line text-sm text-muted-foreground',
          !description && 'invisible',
        )}
        aria-hidden={description ? undefined : true}
      >
        {description ?? 'No description'}
      </p>
      <Summary
        cases={cases}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
      />
    </header>
  );
}

function BranchOverview({
  selection,
  groups,
  statusFilter,
  onStatusFilterChange,
  onSelect,
}: {
  readonly selection: Extract<
    ResolvedSelection,
    { readonly kind: 'module' | 'suite' }
  >;
  readonly groups: readonly Group[];
  readonly statusFilter: StatusFilter;
  readonly onStatusFilterChange: (filter: StatusFilter) => void;
  readonly onSelect: (selection?: Selection) => void;
}) {
  const suite = selection.kind === 'suite' ? selection.suite : undefined;
  const module = selection.kind === 'module' ? selection.module : undefined;
  const cases =
    suite?.cases ??
    module?.cases.map((testCase) => ({
      authorship: selection.authorship,
      module,
      testCase,
    })) ??
    [];
  const suites =
    suite?.suites ??
    (module
      ? createLogicalSuites({
          id: selection.authorship,
          label: selection.authorship,
          modules: [module],
        })
      : []);
  const allCases = suite
    ? logicalSuiteCases(suite)
    : module
      ? moduleCases(module)
      : [];
  const visibleCases = cases.filter(({ testCase }) =>
    statusMatches(testCase.status, statusFilter),
  );
  const visibleSuites = suites.filter((child) =>
    statusMatchesAny(logicalSuiteCases(child), statusFilter),
  );
  return (
    <div className="w-full p-6 lg:p-10">
      <WorkspaceBreadcrumbs
        groups={groups}
        selection={selection}
        onSelect={onSelect}
      />
      <TestPageHeader
        title={suite?.name ?? module?.name ?? ''}
        status={suite?.status ?? module?.status ?? 'pending'}
        description={suite?.description}
        cases={allCases}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
      />
      {suite?.documentation.map((documentation) => (
        <div key={documentation} className="mt-6">
          <SuiteDocumentation markdown={documentation} />
        </div>
      ))}
      <div className="mt-6 space-y-2">
        {visibleCases.map(({ module: caseModule, testCase }) => (
          <button
            key={`${caseModule.id}:${testCase.id}`}
            type="button"
            className="flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-muted/30"
            onClick={() =>
              onSelect({
                kind: 'case',
                authorship: selection.authorship,
                moduleId: caseModule.id,
                caseId: testCase.id,
              })
            }
          >
            <span className="mt-0.5">
              <StatusIcon status={testCase.status} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{testCase.name}</span>
              {testCase.evidence?.description && (
                <span className="mt-0.5 block whitespace-pre-line text-xs leading-5 text-muted-foreground">
                  {testCase.evidence.description}
                </span>
              )}
            </span>
            {testCase.evidence && (
              <span className="text-[10px] text-muted-foreground">
                {testCase.evidence.assertions.length} assertions
              </span>
            )}
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {formatDuration(testCase.duration)}
            </span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </button>
        ))}
        {visibleSuites.map((child) => (
          <button
            key={child.id}
            type="button"
            className="flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-muted/30"
            onClick={() =>
              onSelect({
                kind: 'suite',
                authorship: selection.authorship,
                suitePath: child.path,
              })
            }
          >
            <span className="mt-0.5">
              <StatusIcon status={child.status} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {child.name}
              </span>
              {child.description && (
                <span className="mt-0.5 block whitespace-pre-line text-xs leading-5 text-muted-foreground">
                  {child.description}
                </span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {logicalSuiteCases(child).length} tests
            </span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </button>
        ))}
        {visibleCases.length === 0 && visibleSuites.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No matching tests.
          </p>
        )}
      </div>
    </div>
  );
}

function CaseDetail({
  selection,
  onSelect,
  renderSource,
  groups,
  traceSidebarWidth,
  onTraceSidebarWidthChange,
  traceShowLogs,
  onTraceShowLogsChange,
}: {
  readonly selection: Extract<ResolvedSelection, { readonly kind: 'case' }>;
  readonly onSelect: (selection?: Selection) => void;
  readonly renderSource: LaymosTestsProps['renderSource'];
  readonly groups: readonly Group[];
  readonly traceSidebarWidth: number;
  readonly onTraceSidebarWidthChange?: (width: number) => void;
  readonly traceShowLogs: boolean;
  readonly onTraceShowLogsChange?: (show: boolean) => void;
}) {
  const { module, testCase } = selection;
  const hasAssertions = Boolean(testCase.evidence?.assertions.length);
  const [detailTab, setDetailTab] = useState<'assertions' | 'code'>(
    hasAssertions ? 'assertions' : 'code',
  );
  useEffect(() => {
    setDetailTab(hasAssertions ? 'assertions' : 'code');
  }, [hasAssertions, testCase.id]);
  const sourceTarget = {
    filePath: module.path,
    testName: testCase.name,
    line: testCase.location?.line ?? 1,
    column: testCase.location?.column ?? 1,
  };
  return (
    <div className="w-full p-6 lg:p-10">
      <WorkspaceBreadcrumbs
        groups={groups}
        selection={selection}
        onSelect={onSelect}
      />
      <header className="mt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon status={testCase.status} />
            <h1 className="text-xl font-semibold">{testCase.name}</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusLabel(testCase.status)} · {formatDuration(testCase.duration)}
            {testCase.evidence ? ' · Laymos Test' : ''}
          </p>
        </div>
      </header>
      {testCase.evidence?.description && (
        <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">
          {testCase.evidence.description}
        </p>
      )}
      {testCase.evidence?.documentation && (
        <div className="mt-5">
          <TestDocumentation markdown={testCase.evidence.documentation} />
        </div>
      )}
      <div className="mt-8">
        {renderSource ? (
          <Tabs
            value={detailTab}
            onValueChange={(value) =>
              setDetailTab(value as 'assertions' | 'code')
            }
            className="gap-4"
          >
            <TabsList
              variant="line"
              aria-label="Test details"
              className="h-8 w-full justify-start border-b border-border/60 p-0"
            >
              <TabsTrigger
                value="assertions"
                disabled={!hasAssertions}
                className="h-8 flex-none px-3 text-xs"
                onClick={() => {
                  if (detailTab === 'assertions') setDetailTab('code');
                }}
              >
                Assertions
              </TabsTrigger>
              <TabsTrigger
                value="code"
                className="h-8 flex-none px-3 text-xs"
                onClick={() => {
                  if (detailTab === 'code' && hasAssertions) {
                    setDetailTab('assertions');
                  }
                }}
              >
                Code
              </TabsTrigger>
            </TabsList>
            <TabsContent value="assertions">
              {testCase.evidence && <Assertions evidence={testCase.evidence} />}
            </TabsContent>
            <TabsContent value="code">{renderSource(sourceTarget)}</TabsContent>
          </Tabs>
        ) : (
          testCase.evidence && <Assertions evidence={testCase.evidence} />
        )}
      </div>
      <div className="mt-8 space-y-8">
        {testCase.status === 'skipped' && (
          <p className="rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
            Skipped by Vitest. This test did not execute.
          </p>
        )}
        {testCase.evidence?.trace && (
          <TraceEvidence
            spans={testCase.evidence.trace.spans}
            sidebarWidth={traceSidebarWidth}
            onSidebarWidthChange={onTraceSidebarWidthChange}
            showLogs={traceShowLogs}
            onShowLogsChange={onTraceShowLogsChange}
          />
        )}
        {testCase.errors.length > 0 && (
          <details
            open={testCase.errors.some(hasErrorComparison)}
            className="rounded-lg border"
          >
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Technical details
            </summary>
            <div className="space-y-3 border-t p-4">
              {testCase.errors.map((error, index) => (
                <div key={`${error.name}:${index}`}>
                  <p className="text-sm font-medium text-destructive">
                    {error.name}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {error.message}
                  </p>
                  <ErrorComparison error={error} />
                  {error.stack && (
                    <pre className="mt-2 overflow-auto rounded bg-muted/40 p-3 text-[11px]">
                      {error.stack}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Assertions({ evidence }: { readonly evidence: LaymosTestEvidence }) {
  return (
    <div className="space-y-2">
      {evidence.assertions.map((assertion, index) => (
        <Assertion key={`${assertion.name}:${index}`} assertion={assertion} />
      ))}
    </div>
  );
}

function Assertion({
  assertion,
}: {
  readonly assertion: TestAssertionEvidence;
}) {
  return (
    <details open className="rounded-lg border bg-muted/10">
      <summary className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
        <StatusIcon status={assertion.status} />
        <span className="min-w-0 flex-1 text-sm">{assertion.name}</span>
        <code className="text-[10px] text-muted-foreground">
          {assertion.matcher}
        </code>
      </summary>
      <div className="space-y-3 border-t p-3">
        {assertion.error && (
          <p className="whitespace-pre-wrap text-xs text-destructive">
            {assertion.error.message}
          </p>
        )}
        {assertion.expected !== undefined &&
        assertion.actual !== undefined &&
        assertion.status === 'failed' ? (
          <ValueDiff expected={assertion.expected} actual={assertion.actual} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {assertion.expected !== undefined && (
              <ValuePanel label="Expected" value={assertion.expected} />
            )}
            {assertion.actual !== undefined && (
              <ValuePanel label="Actual" value={assertion.actual} />
            )}
          </div>
        )}
      </div>
    </details>
  );
}

function TraceEvidence({
  spans,
  sidebarWidth,
  onSidebarWidthChange,
  showLogs,
  onShowLogsChange,
}: {
  readonly spans: readonly TestTraceSpan[];
  readonly sidebarWidth: number;
  readonly onSidebarWidthChange?: (width: number) => void;
  readonly showLogs: boolean;
  readonly onShowLogsChange?: (show: boolean) => void;
}) {
  const traces = useMemo(
    () => groupByTrace(spans.map((span) => ({ ...span })) as OtelSpan[]),
    [spans],
  );
  const [activeTraceId, setActiveTraceId] = useState(
    () => traces[0]?.traceId ?? null,
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsByTrace, setSettingsByTrace] = useState<
    Record<string, TraceDockSettings>
  >({});
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!traces.some(({ traceId }) => traceId === activeTraceId)) {
      setActiveTraceId(traces[0]?.traceId ?? null);
      setSettingsByTrace({});
    }
  }, [activeTraceId, traces]);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTraceId]);

  useEffect(() => {
    if (!fullscreen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [fullscreen]);

  const activeTrace =
    traces.find(({ traceId }) => traceId === activeTraceId) ?? traces[0];

  const duplicateNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const trace of traces) {
      counts.set(trace.name, (counts.get(trace.name) ?? 0) + 1);
    }
    return counts;
  }, [traces]);

  const traceLabel = (trace: TraceGroup) => {
    if ((duplicateNameCounts.get(trace.name) ?? 0) < 2) return trace.name;
    const duplicateIndex =
      traces
        .filter(({ name }) => name === trace.name)
        .findIndex(({ traceId }) => traceId === trace.traceId) + 1;
    return `${trace.name} #${duplicateIndex}`;
  };

  const settingsFor = (trace: TraceGroup): TraceDockSettings => ({
    ...(settingsByTrace[trace.traceId] ?? {
      open: true,
      height: 560,
      sidebarWidth,
      nameColWidth: 300,
      sidebarOpen: true,
      selectedSpanId: trace.roots[0]?.span.spanId ?? null,
    }),
    sidebarWidth,
    sidebarOpen: true,
  });

  const updateSettings = (trace: TraceGroup, next: TraceDockSettings) => {
    setSettingsByTrace((current) => ({
      ...current,
      [trace.traceId]: { ...next, sidebarOpen: true },
    }));
    if (next.sidebarWidth !== sidebarWidth) {
      onSidebarWidthChange?.(next.sidebarWidth);
    }
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-background',
        fullscreen
          ? 'fixed inset-3 z-50 h-auto min-h-0 shadow-2xl'
          : 'h-[min(70vh,500px)]',
      )}
    >
      {traces.length === 0 || !activeTrace ? (
        <p className="p-4 text-sm text-muted-foreground">No spans recorded.</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
            {traces.length > 1 && (
              <>
                <div
                  className={cn(
                    'min-w-0 flex-1 overflow-x-auto',
                    scrollbarStyles,
                  )}
                >
                  <div className="flex w-max items-center gap-1">
                    {traces.map((trace) => {
                      const active = trace.traceId === activeTrace.traceId;
                      return (
                        <button
                          key={trace.traceId}
                          ref={active ? activeTabRef : undefined}
                          type="button"
                          className={cn(
                            'flex h-8 max-w-64 items-center gap-2 rounded-md px-2.5 text-xs transition-colors',
                            active
                              ? 'bg-muted font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                          )}
                          title={`${trace.name}\n${trace.spanCount} spans\n${trace.traceId}`}
                          onClick={() => setActiveTraceId(trace.traceId)}
                        >
                          <StatusDot status={trace.status} />
                          <span className="truncate font-mono">
                            {traceLabel(trace)}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatTraceDuration(trace.duration)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Choose trace"
                        title="All traces"
                      />
                    }
                  >
                    <ChevronDown aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    {traces.map((trace) => (
                      <DropdownMenuItem
                        key={trace.traceId}
                        onClick={() => setActiveTraceId(trace.traceId)}
                      >
                        <StatusDot status={trace.status} />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {traceLabel(trace)}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatTraceDuration(trace.duration)}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <label
              className={cn(
                'ml-auto flex shrink-0 cursor-pointer items-center gap-2 px-1 text-xs text-muted-foreground',
                traces.length === 1 && 'ml-auto',
              )}
            >
              Show logs
              <Switch
                size="sm"
                checked={showLogs}
                onCheckedChange={(checked) => onShowLogsChange?.(checked)}
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={() => setFullscreen((current) => !current)}
            >
              {fullscreen ? (
                <Minimize2 aria-hidden />
              ) : (
                <Maximize2 aria-hidden />
              )}
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {traces.map((trace) => (
              <div
                key={trace.traceId}
                className={cn(
                  'h-full',
                  trace.traceId !== activeTrace.traceId && 'hidden',
                )}
              >
                <TraceDock
                  trace={trace}
                  settings={settingsFor(trace)}
                  onSettingsChange={(next) => updateSettings(trace, next)}
                  onClose={() => undefined}
                  showHeader={false}
                  showLogs={showLogs}
                  sidebarAlwaysOpen
                  responsiveSidebar
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResizeHandle({
  width,
  onWidthChange,
}: {
  readonly width: number;
  readonly onWidthChange: (width: number) => void;
}) {
  const widthRef = useRef(width);
  widthRef.current = width;
  const clamp = (value: number) => Math.min(560, Math.max(240, value));
  return (
    <div
      role="separator"
      aria-label="Resize test navigation"
      aria-orientation="vertical"
      aria-valuemin={240}
      aria-valuemax={560}
      aria-valuenow={width}
      tabIndex={0}
      className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize hover:bg-primary/30 focus:bg-primary/30 focus:outline-none max-md:hidden"
      onMouseDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = widthRef.current;
        const move = (moveEvent: MouseEvent) =>
          onWidthChange(clamp(startWidth + startX - moveEvent.clientX));
        const stop = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', stop);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', stop);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onWidthChange(clamp(width + 16));
        if (event.key === 'ArrowRight') onWidthChange(clamp(width - 16));
      }}
    />
  );
}

function Metric({
  label,
  value,
  icon,
  active,
  onClick,
}: {
  readonly label: string;
  readonly value: number;
  readonly icon: ReactNode;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-xl border p-4 text-left hover:border-primary/40 hover:bg-muted/20',
        active && 'border-primary/40 bg-primary/5',
      )}
      onClick={onClick}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <span className="mt-3 block text-2xl font-semibold tabular-nums">
        {value}
      </span>
    </button>
  );
}

function DashboardSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

type LocatedCase = {
  readonly authorship: Authorship;
  readonly module: TestModuleReport;
  readonly testCase: TestCaseReport;
};

function CompactCaseList({
  cases,
  onSelect,
}: {
  readonly cases: readonly LocatedCase[];
  readonly onSelect: (selection: Selection) => void;
}) {
  if (cases.length === 0) {
    return <p className="text-sm text-muted-foreground">No matching tests.</p>;
  }
  return (
    <div className="divide-y rounded-lg border">
      {cases.map((located) => (
        <CompactCaseRow
          key={`${located.authorship}:${located.module.id}:${located.testCase.id}`}
          located={located}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function CompactCaseRow({
  located,
  onSelect,
}: {
  readonly located: LocatedCase;
  readonly onSelect: (selection: Selection) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/30"
      onClick={() =>
        onSelect({
          kind: 'case',
          authorship: located.authorship,
          moduleId: located.module.id,
          caseId: located.testCase.id,
        })
      }
    >
      <span className="mt-0.5">
        <StatusIcon status={located.testCase.status} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{located.testCase.name}</span>
        {located.testCase.evidence?.description && (
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {located.testCase.evidence.description}
          </span>
        )}
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {formatDuration(located.testCase.duration)}
      </span>
      <ChevronRight className="size-3.5 text-muted-foreground" />
    </button>
  );
}

function ErrorRow({
  label,
  error,
}: {
  readonly label: string;
  readonly error: TestErrorReport;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
        <AlertTriangle className="size-3.5 text-destructive" />
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t bg-muted/10 p-3 text-xs text-muted-foreground">
        <p>{error.message}</p>
        <ErrorComparison error={error} />
        {error.stack && (
          <pre className="mt-2 overflow-auto whitespace-pre-wrap">
            {error.stack}
          </pre>
        )}
      </div>
    </details>
  );
}

function ErrorComparison({ error }: { readonly error: TestErrorReport }) {
  const hasComparison = hasExpectedAndActual(error);
  if (!hasComparison && error.diff === undefined) return null;
  return (
    <div className="mt-3 space-y-3 text-foreground">
      {hasComparison && (
        <ValueDiff expected={error.expected} actual={error.actual} />
      )}
      {error.diff && (
        <details className="rounded-md border bg-background">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
            Vitest diff
          </summary>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t p-3 font-mono text-xs">
            {error.diff}
          </pre>
        </details>
      )}
    </div>
  );
}

function hasErrorComparison(error: TestErrorReport): boolean {
  return hasExpectedAndActual(error) || error.diff !== undefined;
}

function hasExpectedAndActual(
  error: TestErrorReport,
): error is TestErrorReport & {
  readonly expected: string;
  readonly actual: string;
} {
  return error.expected !== undefined && error.actual !== undefined;
}

function Summary({
  cases,
  statusFilter,
  onStatusFilterChange,
}: {
  readonly cases: readonly TestCaseReport[];
  readonly statusFilter: StatusFilter;
  readonly onStatusFilterChange: (filter: StatusFilter) => void;
}) {
  const toggle = (filter: StatusFilter) =>
    onStatusFilterChange(statusFilter === filter ? 'all' : filter);
  return (
    <div className="mt-5 flex w-fit max-w-full flex-wrap overflow-hidden rounded-md border bg-muted/10 text-xs">
      <SummaryItem
        label="Tests"
        value={cases.length}
        active={statusFilter === 'all'}
        onClick={() => onStatusFilterChange('all')}
      />
      <SummaryItem
        label="Passed"
        value={countStatus(cases, 'passed')}
        active={statusFilter === 'passed'}
        onClick={() => toggle('passed')}
      />
      <SummaryItem
        label="Failed"
        value={countStatus(cases, 'failed')}
        active={statusFilter === 'failed'}
        onClick={() => toggle('failed')}
      />
      <SummaryItem
        label="Skipped"
        value={countStatus(cases, 'skipped') + countStatus(cases, 'pending')}
        active={statusFilter === 'skipped'}
        onClick={() => toggle('skipped')}
      />
      <SummaryItem
        label="Time"
        value={formatDuration(
          cases.reduce((total, testCase) => total + testCase.duration, 0),
        )}
      />
    </div>
  );
}

function SummaryItem({
  label,
  value,
  active = false,
  onClick,
}: {
  readonly label: string;
  readonly value: number | string;
  readonly active?: boolean;
  readonly onClick?: () => void;
}) {
  const content = (
    <>
      <span className="text-muted-foreground">{label}</span>{' '}
      <strong
        className={cn(
          'font-semibold tabular-nums',
          value !== 0 && label === 'Failed' && 'text-destructive',
          value !== 0 && label === 'Skipped' && 'text-amber-600',
        )}
      >
        {value}
      </strong>
    </>
  );
  const className = cn(
    'border-r px-3 py-2 last:border-r-0',
    value === 0 && 'opacity-40',
    onClick && 'hover:bg-muted/50',
    active && 'bg-primary/10',
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className={className}>{content}</span>
  );
}

function StatusIcon({ status }: { readonly status: TestStatus }) {
  const Icon =
    status === 'passed'
      ? Check
      : status === 'failed'
        ? CircleX
        : status === 'pending'
          ? Clock
          : SkipForward;
  return (
    <Icon
      className={cn(
        'size-3.5 shrink-0',
        status === 'passed' && 'text-emerald-600',
        status === 'failed' && 'text-destructive',
        status === 'pending' && 'text-amber-500',
        status === 'skipped' && 'text-muted-foreground',
      )}
      aria-label={status}
    />
  );
}

function ValuePanel({
  label,
  value,
}: {
  readonly label: string;
  readonly value: TestValue;
}) {
  return (
    <div className="min-w-0">
      <AutoValue label={label} value={value} detectCode={false} />
    </div>
  );
}

function createGroups(modules: readonly TestModuleReport[]): readonly Group[] {
  return (
    [
      ['laymos', 'laymos'],
      ['vitest', 'Vitest'],
    ] as const
  ).flatMap(([id, label]) => {
    const filtered = modules.flatMap((module) => {
      const result = filterModule(module, id);
      return result ? [result] : [];
    });
    return filtered.length > 0 ? [{ id, label, modules: filtered }] : [];
  });
}

function createLogicalSuites(group: Group): readonly LogicalSuite[] {
  return mergeLogicalSuites(
    group.id,
    group.modules.flatMap((module) =>
      module.suites.map((suite) => ({ module, suite })),
    ),
    [],
  );
}

function mergeLogicalSuites(
  authorship: Authorship,
  members: readonly SuiteMember[],
  parentPath: readonly string[],
): readonly LogicalSuite[] {
  const byName = new Map<string, SuiteMember[]>();
  for (const member of members) {
    const existing = byName.get(member.suite.name);
    if (existing) existing.push(member);
    else byName.set(member.suite.name, [member]);
  }
  return [...byName].map(([name, groupedMembers]) => {
    const path = [...parentPath, name];
    const suites = mergeLogicalSuites(
      authorship,
      groupedMembers.flatMap(({ module, suite }) =>
        suite.suites.map((child) => ({ module, suite: child })),
      ),
      path,
    );
    const cases = groupedMembers.flatMap(({ module, suite }) =>
      suite.cases.map((testCase) => ({ authorship, module, testCase })),
    );
    const descriptions = uniqueDefined(
      groupedMembers.map(({ suite }) => suite.description),
    );
    const documentation = uniqueDefined(
      groupedMembers.map(({ suite }) => suite.documentation),
    );
    return {
      id: logicalSuiteId(authorship, path),
      authorship,
      name,
      path,
      members: groupedMembers,
      cases,
      suites,
      status: combinedStatus([
        ...groupedMembers.map(({ suite }) => suite.status),
        ...cases.map(({ testCase }) => testCase.status),
      ]),
      ...(descriptions.length > 0
        ? { description: descriptions.join('\n') }
        : {}),
      documentation,
    };
  });
}

function uniqueDefined(
  values: readonly (string | undefined)[],
): readonly string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function logicalSuiteId(
  authorship: Authorship,
  path: readonly string[],
): string {
  return `${authorship}:suite:${JSON.stringify(path)}`;
}

function logicalSuiteCases(suite: LogicalSuite): readonly TestCaseReport[] {
  return [
    ...suite.cases.map(({ testCase }) => testCase),
    ...suite.suites.flatMap(logicalSuiteCases),
  ];
}

function findLogicalSuite(
  suites: readonly LogicalSuite[],
  path: readonly string[],
): LogicalSuite | undefined {
  let level = suites;
  let found: LogicalSuite | undefined;
  for (const name of path) {
    found = level.find((suite) => suite.name === name);
    if (!found) return undefined;
    level = found.suites;
  }
  return found;
}

function filterModule(
  module: TestModuleReport,
  authorship: Authorship,
): TestModuleReport | undefined {
  const cases = module.cases.filter((testCase) =>
    matchesAuthorship(testCase, authorship),
  );
  const suites = module.suites.flatMap((suite) => {
    const filtered = filterSuite(suite, authorship);
    return filtered ? [filtered] : [];
  });
  if (cases.length === 0 && suites.length === 0 && module.errors.length === 0) {
    return undefined;
  }
  const allCases = [...cases, ...suites.flatMap(suiteCases)];
  return {
    ...module,
    cases,
    suites,
    status:
      module.errors.length > 0
        ? 'failed'
        : combinedStatus(allCases.map(({ status }) => status)),
    duration: allCases.reduce(
      (total, testCase) => total + testCase.duration,
      0,
    ),
  };
}

function filterSuite(
  suite: TestSuiteReport,
  authorship: Authorship,
): TestSuiteReport | undefined {
  const cases = suite.cases.filter((testCase) =>
    matchesAuthorship(testCase, authorship),
  );
  const suites = suite.suites.flatMap((child) => {
    const filtered = filterSuite(child, authorship);
    return filtered ? [filtered] : [];
  });
  if (cases.length === 0 && suites.length === 0) return undefined;
  const allCases = [...cases, ...suites.flatMap(suiteCases)];
  return {
    ...suite,
    cases,
    suites,
    status: combinedStatus(allCases.map(({ status }) => status)),
  };
}

function resolveSelection(
  groups: readonly Group[],
  selection?: Selection,
): ResolvedSelection | undefined {
  if (!selection) return undefined;
  const group = groups.find(({ id }) => id === selection.authorship);
  if (!group) return undefined;
  if (selection.kind === 'group') return { kind: 'group', group };
  if (selection.kind === 'suite') {
    const suite = findLogicalSuite(
      createLogicalSuites(group),
      selection.suitePath,
    );
    return suite
      ? { kind: 'suite', authorship: selection.authorship, group, suite }
      : undefined;
  }
  const module = group?.modules.find(({ id }) => id === selection.moduleId);
  if (!module) return undefined;
  if (selection.kind === 'module') {
    return { kind: 'module', authorship: selection.authorship, module };
  }
  const directCase = module.cases.find(({ id }) => id === selection.caseId);
  if (directCase) {
    return {
      kind: 'case',
      authorship: selection.authorship,
      module,
      testCase: directCase,
      suitePath: [],
    };
  }
  const located = findCase(module.suites, selection.caseId);
  return located
    ? {
        kind: 'case',
        authorship: selection.authorship,
        module,
        testCase: located.testCase,
        suitePath: located.suitePath,
      }
    : undefined;
}

function findCase(
  suites: readonly TestSuiteReport[],
  id: string,
  parents: readonly TestSuiteReport[] = [],
):
  | { testCase: TestCaseReport; suitePath: readonly TestSuiteReport[] }
  | undefined {
  for (const suite of suites) {
    const path = [...parents, suite];
    const testCase = suite.cases.find((candidate) => candidate.id === id);
    if (testCase) return { testCase, suitePath: path };
    const child = findCase(suite.suites, id, path);
    if (child) return child;
  }
  return undefined;
}

function locateCases(groups: readonly Group[]): readonly LocatedCase[] {
  return groups.flatMap((group) =>
    group.modules.flatMap((module) =>
      moduleCases(module).map((testCase) => ({
        authorship: group.id,
        module,
        testCase,
      })),
    ),
  );
}

function matchesAuthorship(
  testCase: TestCaseReport,
  authorship: Authorship,
): boolean {
  const laymos =
    testCase.authoredBy === 'laymos' || testCase.evidence !== undefined;
  return authorship === 'laymos' ? laymos : !laymos;
}

function moduleCases(module: TestModuleReport): readonly TestCaseReport[] {
  return [...module.cases, ...module.suites.flatMap(suiteCases)];
}

function suiteCases(suite: TestSuiteReport): readonly TestCaseReport[] {
  return [...suite.cases, ...suite.suites.flatMap(suiteCases)];
}

function logicalSuiteVisible(
  suite: LogicalSuite,
  query: string,
  statusFilter: StatusFilter,
): boolean {
  const cases = logicalSuiteCases(suite);
  return (
    statusMatchesAny(cases, statusFilter) &&
    (textMatches(suite.name, query) ||
      (suite.description !== undefined &&
        textMatches(suite.description, query)) ||
      suite.cases.some(({ testCase }) =>
        caseVisible(testCase, query, statusFilter),
      ) ||
      suite.suites.some((child) =>
        logicalSuiteVisible(child, query, statusFilter),
      ))
  );
}

function logicalSuiteContainsSelection(
  suite: LogicalSuite,
  selection?: Selection,
): boolean {
  if (!selection || selection.authorship !== suite.authorship) return false;
  if (selection.kind === 'suite') {
    return pathStartsWith(selection.suitePath, suite.path);
  }
  if (selection.kind !== 'case') return false;
  return logicalSuiteCasesLocated(suite).some(({ module, testCase }) =>
    isSelectedCase(selection, suite.authorship, module.id, testCase.id),
  );
}

function logicalSuiteCasesLocated(suite: LogicalSuite): readonly LocatedCase[] {
  return [...suite.cases, ...suite.suites.flatMap(logicalSuiteCasesLocated)];
}

function isSelectedCase(
  selection: Selection | undefined,
  authorship: Authorship,
  moduleId: string,
  caseId: string,
): boolean {
  return (
    selection?.kind === 'case' &&
    selection.authorship === authorship &&
    selection.moduleId === moduleId &&
    selection.caseId === caseId
  );
}

function pathsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && pathStartsWith(left, right);
}

function pathStartsWith(
  path: readonly string[],
  prefix: readonly string[],
): boolean {
  return prefix.every((segment, index) => path[index] === segment);
}

function caseVisible(
  testCase: TestCaseReport,
  query: string,
  statusFilter: StatusFilter,
): boolean {
  return (
    statusMatches(testCase.status, statusFilter) &&
    (textMatches(testCase.name, query) ||
      textMatches(testCase.fullName, query) ||
      (testCase.evidence?.description !== undefined &&
        textMatches(testCase.evidence.description, query)))
  );
}

function textMatches(value: string, query: string): boolean {
  return query.length === 0 || value.toLocaleLowerCase().includes(query);
}

function statusMatchesAny(
  cases: readonly TestCaseReport[],
  filter: StatusFilter,
): boolean {
  return (
    filter === 'all' ||
    cases.some(({ status }) => statusMatches(status, filter))
  );
}

function statusMatches(status: TestStatus, filter: StatusFilter): boolean {
  return (
    filter === 'all' ||
    status === filter ||
    (filter === 'skipped' && status === 'pending')
  );
}

function allExpansionIds(groups: readonly Group[]): readonly string[] {
  return groups.flatMap((group) => [
    `group:${group.id}`,
    ...createLogicalSuites(group).flatMap(logicalSuiteIds),
    ...(group.modules.some((module) => module.cases.length > 0)
      ? [`${group.id}:ungrouped`]
      : []),
  ]);
}

function selectionExpansionIds(
  groups: readonly Group[],
  selection: Selection,
): readonly string[] {
  const group = groups.find(({ id }) => id === selection.authorship);
  if (selection.kind === 'group') return [`group:${selection.authorship}`];
  const ids = [`group:${selection.authorship}`];
  if (selection.kind === 'suite') {
    return [
      ...ids,
      ...selection.suitePath.map((_, index) =>
        logicalSuiteId(
          selection.authorship,
          selection.suitePath.slice(0, index + 1),
        ),
      ),
    ];
  }
  const module = group?.modules.find(({ id }) => id === selection.moduleId);
  if (!module) return ids;
  if (selection.kind === 'case') {
    const located = findCase(module.suites, selection.caseId);
    ids.push(
      ...(located?.suitePath.map((_, index) =>
        logicalSuiteId(
          selection.authorship,
          located.suitePath.slice(0, index + 1).map(({ name }) => name),
        ),
      ) ?? []),
    );
    if (located === undefined) {
      ids.push(`${selection.authorship}:ungrouped`);
    }
  }
  return ids;
}

function logicalSuiteIds(suite: LogicalSuite): readonly string[] {
  return [suite.id, ...suite.suites.flatMap(logicalSuiteIds)];
}

function combinedStatus(statuses: readonly TestStatus[]): TestStatus {
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('passed')) return 'passed';
  return 'skipped';
}

function countStatus(
  cases: readonly TestCaseReport[],
  status: TestStatus,
): number {
  return cases.filter((testCase) => testCase.status === status).length;
}

function statusLabel(status: TestStatus): string {
  return status[0]!.toUpperCase() + status.slice(1);
}

function filterLabel(filter: StatusFilter): string {
  switch (filter) {
    case 'all':
      return 'All';
    case 'failed':
      return 'Failed';
    case 'passed':
      return 'Passed';
    case 'skipped':
      return 'Skipped and pending';
  }
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1) return '<1 ms';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(2)} s`;
}
