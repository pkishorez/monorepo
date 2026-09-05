import {
  AlertCircle,
  GitFork,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { StudioRpcClient } from 'std-toolkit/studio-rpc';

import { ERDiagram } from '../../er-diagram/er-diagram';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { cn } from '#lib/utils';

import { QueryWorkspace } from '../query-workspace';
import { useSnapshotSession } from '../snapshot-session';

export interface StdToolkitStudioProps {
  readonly rpcClient: StudioRpcClient<unknown>;
  readonly className?: string;
}

export function StdToolkitStudio({
  rpcClient,
  className,
}: StdToolkitStudioProps) {
  const { state, refresh } = useSnapshotSession(rpcClient);

  if (state.kind === 'loading') {
    return (
      <StudioState
        className={className}
        icon={<LoaderCircle className="animate-spin" />}
        title="Loading Studio"
        detail="Fetching the table snapshot through Studio RPC."
      />
    );
  }

  if (state.kind === 'failure') {
    return (
      <StudioState
        className={className}
        icon={<AlertCircle />}
        title="Studio could not load"
        detail={state.message}
        action={
          <Button type="button" variant="outline" onClick={refresh}>
            <RefreshCw />
            Retry
          </Button>
        }
      />
    );
  }

  const snapshotKey = JSON.stringify(state.snapshot);

  return (
    <section
      className={cn(
        'overflow-clip rounded-2xl border bg-card text-card-foreground shadow-sm',
        className,
      )}
      aria-label={`${state.snapshot.logicalName} Studio`}
    >
      <Tabs defaultValue="diagram" className="gap-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <GitFork className="size-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">
                  {state.snapshot.logicalName}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Std Toolkit Studio
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TabsList variant="line">
              <TabsTrigger value="diagram">
                <GitFork />
                Diagram
              </TabsTrigger>
              <TabsTrigger value="query">
                <Search />
                Query
              </TabsTrigger>
            </TabsList>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={state.refreshing}
            >
              <RefreshCw
                className={cn(state.refreshing && 'animate-spin')}
                aria-hidden
              />
              Refresh snapshot
            </Button>
          </div>
        </header>

        <TabsContent value="diagram" keepMounted className="p-4 sm:p-5">
          <ERDiagram
            snapshot={state.snapshot}
            ariaLabel={`${state.snapshot.logicalName} Entity relationships`}
          />
        </TabsContent>
        <TabsContent value="query" keepMounted className="p-4 sm:p-5">
          <QueryWorkspace
            key={snapshotKey}
            snapshot={state.snapshot}
            rpcClient={rpcClient}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function StudioState({
  className,
  icon,
  title,
  detail,
  action,
}: {
  readonly className?: string;
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <Empty className={cn('min-h-[560px] rounded-2xl border', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      {action !== undefined && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
