import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DependencyCruiserViz } from '@monorepo/frontend/components/blocks/dependency-cruiser-viz';
import { VtestView } from '@monorepo/frontend/components/blocks/vtest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@monorepo/frontend/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@monorepo/frontend/components/ui/empty';
import { DevtoolsHeader, type DevtoolsTab } from './header';
import { ProjectManager } from './project-manager';
import {
  mergeRunRecords,
  useDepcruise,
  useVtestDocs,
  useVtestRun,
} from './queries';
import { makeDevtoolsRuntime } from './runtime';
import { useDevtoolsStore } from './store';

/** The full DevTools workbench for a single configured dev URL. */
export function DevtoolsShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const devUrl = useDevtoolsStore((s) => s.devUrl);
  const projects = useDevtoolsStore((s) => s.projects);
  const selectedPath = useDevtoolsStore((s) => s.selectedPath);

  const runtime = useMemo(() => makeDevtoolsRuntime(devUrl), [devUrl]);
  const path = selectedPath ?? '';

  const [tab, setTab] = useState<DevtoolsTab>('vtest');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showHome, setShowHome] = useState(!selectedPath);
  const [depcruiseOpened, setDepcruiseOpened] = useState(false);

  const docs = useVtestDocs(runtime, path);
  const run = useVtestRun(runtime, path);
  const depcruise = useDepcruise(runtime, path, depcruiseOpened);

  const selected = projects.find((p) => p.path === selectedPath) ?? null;
  const selectedLabel = selected
    ? (selected.label ?? selected.path.split('/').pop() ?? selected.path)
    : null;

  const onTab = (next: DevtoolsTab) => {
    if (next === 'depcruise') setDepcruiseOpened(true);
    setTab(next);
  };

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['vtest-docs', runtime] });
    void queryClient.invalidateQueries({ queryKey: ['vtest-run', runtime] });
    void queryClient.invalidateQueries({ queryKey: ['depcruise', runtime] });
  };

  const isReloading = docs.isFetching || run.isFetching || depcruise.isFetching;

  if (showHome || !selectedPath) {
    return (
      <div className="min-h-dvh">
        <DevtoolsHeader
          tab={tab}
          onTab={onTab}
          onHome={() => navigate({ to: '/' })}
          onNavigate={() => setDialogOpen(true)}
          onReload={reload}
          selectedLabel={selectedLabel}
          canReload={!!selectedPath}
          isReloading={isReloading}
        />
        <div className="mx-auto max-w-2xl space-y-6 p-8">
          {projects.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No projects added</EmptyTitle>
                <EmptyDescription>
                  Add a project below to visualize its vtest docs and dependency
                  graph.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <ProjectManager onSelected={() => setShowHome(false)} />
        </div>
        <NavigateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <DevtoolsHeader
        tab={tab}
        onTab={onTab}
        onHome={() => setShowHome(true)}
        onNavigate={() => setDialogOpen(true)}
        onReload={reload}
        selectedLabel={selectedLabel}
        canReload
        isReloading={isReloading}
      />
      <div
        className={
          tab === 'vtest' ? 'min-h-0 flex-1 overflow-y-auto' : 'min-h-0 flex-1'
        }
      >
        {tab === 'vtest' ? (
          <VtestPane docs={docs} run={run} />
        ) : (
          <DepcruisePane depcruise={depcruise} />
        )}
      </div>
      <NavigateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function NavigateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Navigate to project</DialogTitle>
          <DialogDescription>
            Pick a project by absolute path, or add a new one.
          </DialogDescription>
        </DialogHeader>
        <ProjectManager onSelected={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type VtestQuery = ReturnType<typeof useVtestDocs>;
type RunQuery = ReturnType<typeof useVtestRun>;
type DepcruiseQuery = ReturnType<typeof useDepcruise>;

/**
 * Renders the vtest reader as soon as the fast docs resolve (with pending
 * statuses), then re-renders with filled statuses once the slow run resolves. A
 * subtle banner signals an in-flight run while the docs are already visible.
 */
function VtestPane({ docs, run }: { docs: VtestQuery; run: RunQuery }) {
  if (docs.isPending) return <Loading />;
  if (docs.isError) return <ErrorState message={messageOf(docs.error)} />;
  if (!docs.data.available) return <NotConfigured tool="VTest" />;

  const records = run.data?.available ? run.data.records : undefined;
  const config = mergeRunRecords(docs.data, records);

  return (
    <div className="relative">
      {run.isFetching && <RunningTests />}
      <VtestView config={config} />
    </div>
  );
}

function DepcruisePane({ depcruise }: { depcruise: DepcruiseQuery }) {
  if (depcruise.isPending) return <Loading />;
  if (depcruise.isError)
    return <ErrorState message={messageOf(depcruise.error)} />;
  if (!depcruise.data.available) return <NotConfigured tool="DepCruise" />;
  return <DependencyCruiserViz {...depcruise.data.data} />;
}

function RunningTests() {
  return (
    <div className="absolute right-4 top-4 z-10 rounded-md border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
      Running tests…
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full items-center justify-center p-12 text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function NotConfigured({ tool }: { tool: string }) {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{tool} not configured</EmptyTitle>
          <EmptyDescription>
            This tool is not configured for this package.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function messageOf(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
