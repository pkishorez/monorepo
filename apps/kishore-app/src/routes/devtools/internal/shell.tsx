import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DependencyCruiserViz } from '@monorepo/frontend/components/blocks/dependency-cruiser-viz';
import { Button } from '@monorepo/frontend/components/ui/button';
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
import { ServerIcon } from '@monorepo/frontend/lucide';
import { CommandHint } from './command-hint';
import { DevtoolsHeader, ProjectSwitcher, ReloadButton } from './header';
import { ProjectManager } from './project-manager';
import { clearTelemetry, useDepcruise } from './queries';
import { makeDevtoolsRuntime, type DevtoolsRuntime } from './runtime';
import { isValidBaseUrl, useDevtoolsStore } from './store';
import { routeApi, useActiveTool } from './use-active-tool';
import { buildTelemetryCollections } from './telemetry/collections';
import { Viewer } from './telemetry/viewer';

/** The DevTools workbench: tool-first, sharing one DevTools URL / runtime. */
export function DevtoolsShell() {
  const devUrl = useDevtoolsStore((s) => s.devUrl);
  const [activeTool] = useActiveTool();
  const urlParam = routeApi.useSearch({ select: (s) => s.url });
  const navigate = useNavigate();

  // Adopt a server URL handed in by the CLI as `?url=` (e.g. the link printed
  // by `devtools` on startup), then strip it from the address bar so the link is
  // single-use and doesn't linger.
  useEffect(() => {
    if (!urlParam) return;
    const trimmed = urlParam.trim();
    if (isValidBaseUrl(trimmed)) {
      useDevtoolsStore.getState().setDevUrl(trimmed.replace(/\/+$/, ''));
    }
    void navigate({
      to: '/devtools',
      search: (prev) => ({ tool: prev.tool ?? 'otel', url: undefined }),
      replace: true,
    });
  }, [urlParam, navigate]);

  const runtime = useMemo(() => makeDevtoolsRuntime(devUrl), [devUrl]);

  if (!isValidBaseUrl(devUrl)) return <NotConnected />;

  return activeTool === 'otel' ? (
    <TelemetryPane devUrl={devUrl} runtime={runtime} />
  ) : (
    <DependenciesPane runtime={runtime} />
  );
}

/** Fail-early state shown when no DevTools server URL is configured yet. */
function NotConnected() {
  const navigate = useNavigate();
  const setConnectionOpen = useDevtoolsStore((s) => s.setConnectionOpen);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <DevtoolsHeader onHome={() => navigate({ to: '/' })} />
      <div className="flex min-h-0 flex-1 items-center justify-center p-12">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No connection configured</EmptyTitle>
            <EmptyDescription>
              Point DevTools at a running server to start inspecting telemetry
              and dependencies.
            </EmptyDescription>
          </EmptyHeader>
          <Button className="mt-4" onClick={() => setConnectionOpen(true)}>
            <ServerIcon className="size-4" />
            Configure connection
          </Button>
          <div className="mt-6 w-full max-w-sm text-left">
            <CommandHint />
          </div>
        </Empty>
      </div>
    </div>
  );
}

/** Global Telemetry tool: a live trace/log viewer over the DevTools RPC surface. */
function TelemetryPane({
  devUrl,
  runtime,
}: {
  devUrl: string;
  runtime: DevtoolsRuntime;
}) {
  const navigate = useNavigate();
  const [resetKey, setResetKey] = useState(0);

  const collections = useMemo(
    () => buildTelemetryCollections(devUrl),
    [devUrl, resetKey],
  );

  const handleClear = useCallback(async () => {
    try {
      await clearTelemetry(runtime);
    } catch {
      // remount even if the delete failed; the user can retry
    }
    setResetKey((k) => k + 1);
  }, [runtime]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <DevtoolsHeader onHome={() => navigate({ to: '/' })} />
      <div className="min-h-0 flex-1">
        <Viewer
          key={resetKey}
          collections={collections}
          onClear={handleClear}
        />
      </div>
    </div>
  );
}

/** Per-project Dependencies tool: the dependency-cruiser graph for a package. */
function DependenciesPane({ runtime }: { runtime: DevtoolsRuntime }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useDevtoolsStore((s) => s.projects);
  const selectedPath = useDevtoolsStore((s) => s.selectedPath);
  const path = selectedPath ?? '';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [showHome, setShowHome] = useState(!selectedPath);

  // ⌘K / Ctrl+K opens the project picker (mounted only on the depcruise tab).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setDialogOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const depcruise = useDepcruise(runtime, path);

  const selected = projects.find((p) => p.path === selectedPath) ?? null;
  const selectedLabel = selected
    ? (selected.label ?? selected.path.split('/').pop() ?? selected.path)
    : null;

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['depcruise', runtime] });
  };

  const isReloading = depcruise.isFetching;
  const projectSwitcher = (
    <ProjectSwitcher
      label={selectedLabel}
      onClick={() => setDialogOpen(true)}
    />
  );

  if (showHome || !selectedPath) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <DevtoolsHeader
          onHome={() => navigate({ to: '/' })}
          center={projectSwitcher}
        />
        <div className="min-h-0 flex-1 overflow-auto">
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
        </div>
        <NavigateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <DevtoolsHeader
        onHome={() => navigate({ to: '/' })}
        center={projectSwitcher}
        actions={
          <ReloadButton onReload={reload} canReload isReloading={isReloading} />
        }
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
