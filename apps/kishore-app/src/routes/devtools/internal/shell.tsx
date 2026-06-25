import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DependencyCruiserViz } from '@monorepo/frontend/components/blocks/dependency-cruiser-viz';
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
import { DevtoolsHeader } from './header';
import { ProjectManager } from './project-manager';
import { useDepcruise } from './queries';
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [showHome, setShowHome] = useState(!selectedPath);

  const depcruise = useDepcruise(runtime, path);

  const selected = projects.find((p) => p.path === selectedPath) ?? null;
  const selectedLabel = selected
    ? (selected.label ?? selected.path.split('/').pop() ?? selected.path)
    : null;

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['depcruise', runtime] });
  };

  const isReloading = depcruise.isFetching;

  if (showHome || !selectedPath) {
    return (
      <div className="min-h-dvh">
        <DevtoolsHeader
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
                  Add a project below to visualize its dependency graph.
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
        onHome={() => setShowHome(true)}
        onNavigate={() => setDialogOpen(true)}
        onReload={reload}
        selectedLabel={selectedLabel}
        canReload
        isReloading={isReloading}
      />
      <div className="min-h-0 flex-1">
        <DepcruisePane depcruise={depcruise} />
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

type DepcruiseQuery = ReturnType<typeof useDepcruise>;

function DepcruisePane({ depcruise }: { depcruise: DepcruiseQuery }) {
  if (depcruise.isPending) return <Loading />;
  if (depcruise.isError)
    return <ErrorState message={messageOf(depcruise.error)} />;
  if (!depcruise.data.available) return <NotConfigured tool="DepCruise" />;
  return <DependencyCruiserViz {...depcruise.data.data} />;
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
