import { Effect } from 'effect';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'kui-toolkit/components/ui/collapsible';
import { Input } from 'kui-toolkit/components/ui/input';
import { Box, ChevronRight, Search } from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import {
  EmptyState,
  ListSkeleton,
  QueryError,
} from '../../query-feedback/index.ts';
import {
  flattenScalars,
  JsonButton,
  KeyValueTable,
  PaneHeader,
  RefreshButton,
  ResourceName,
  SectionHeading,
  Status,
} from '../state-view/index.ts';
import { rpcQueryKeys, useRpcQuery } from '../queries/index.ts';

type Summary = {
  fqn: string;
  kind: 'resource' | 'action';
  type: string | null;
  status: string | null;
};

export function ResourceBrowser({
  storeId,
  stack,
  stage,
  StageAction,
}: {
  storeId: string;
  stack: string;
  stage: string;
  StageAction: ComponentType<{ stack: string; stage: string }>;
}) {
  const [filter, setFilter] = useState('');
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['Explorer.GetStageView']({ storeId, stack, stage }),
    ),
    rpcQueryKeys.stageView(storeId, stack, stage),
  );
  const rows = query.data?.data.resources ?? [];
  const needle = filter.trim().toLocaleLowerCase();
  const visible = needle
    ? rows.filter(
        (row) =>
          row.fqn.toLocaleLowerCase().includes(needle) ||
          row.type?.toLocaleLowerCase().includes(needle),
      )
    : rows;
  const resources = visible.filter((row) => row.kind === 'resource');
  const actions = visible.filter((row) => row.kind === 'action');

  return (
    <div className="space-y-8">
      <PaneHeader
        eyebrow={stack}
        title={stage}
        actions={
          <>
            <RefreshButton query={query} label="Refresh stage data" />
            <StageAction stack={stack} stage={stage} />
          </>
        }
      />

      {query.error && (
        <QueryError
          message={query.error}
          stale={query.data !== null}
          pending={query.pending}
          onRetry={query.refresh}
        />
      )}
      {query.pending && !query.data && <ListSkeleton label="Loading stage" />}

      {query.data && (
        <>
          {rows.length > 0 && (
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search resources and actions"
                placeholder="Search by name or type"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="pl-9"
              />
            </div>
          )}
          {rows.length === 0 && (
            <EmptyState
              icon={Box}
              title="No resources yet"
              description="Resources appear here after the first deployment to this stage."
              action={
                <Button variant="outline" onClick={query.refresh}>
                  Refresh stage
                </Button>
              }
            />
          )}
          {rows.length > 0 && visible.length === 0 && (
            <EmptyState
              icon={Search}
              title={`No items match “${filter}”`}
              description="Search by a resource or action name or type."
              action={
                <Button variant="outline" onClick={() => setFilter('')}>
                  Clear search
                </Button>
              }
            />
          )}
          {resources.length > 0 && (
            <StateSection
              title="Resources"
              rows={resources}
              storeId={storeId}
              stack={stack}
              stage={stage}
            />
          )}
          {actions.length > 0 && (
            <StateSection
              title="Actions"
              rows={actions}
              storeId={storeId}
              stack={stack}
              stage={stage}
            />
          )}
          <section aria-labelledby="outputs-heading" className="space-y-3">
            <SectionHeading
              id="outputs-heading"
              title="Outputs"
              action={
                query.data.data.outputs !== null && (
                  <JsonButton
                    title="Stage outputs"
                    value={query.data.data.outputs}
                    label="View outputs as JSON"
                  />
                )
              }
            />
            <KeyValueTable
              groups={[{ rows: flattenScalars(query.data.data.outputs) }]}
              empty="This stage has no outputs."
            />
          </section>
        </>
      )}
    </div>
  );
}

function StateSection({
  title,
  rows,
  ...target
}: {
  title: string;
  rows: ReadonlyArray<Summary>;
  storeId: string;
  stack: string;
  stage: string;
}) {
  const id = `${title.toLocaleLowerCase()}-heading`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <SectionHeading id={id} title={title} count={rows.length} />
      <div className="overflow-hidden rounded-lg bg-card shadow-raised">
        {rows.map((row) => (
          <StateItem key={row.fqn} summary={row} {...target} />
        ))}
      </div>
    </section>
  );
}

// The rows worth scanning without opening JSON: identity, then whatever
// scalars the provider recorded. Nested values stay in the JSON dialog.
function stateGroups(
  summary: Summary,
  state: {
    kind?: 'resource' | 'action';
    instanceId?: string;
    props?: unknown;
    attr?: unknown;
    input?: unknown;
    output?: unknown;
  },
) {
  const identity = [
    { key: 'type', value: summary.type },
    { key: 'status', value: summary.status },
    ...(state.instanceId
      ? [{ key: 'instanceId', value: state.instanceId }]
      : []),
  ];
  return state.kind === 'action'
    ? [
        { rows: identity },
        { title: 'Input', rows: flattenScalars(state.input) },
        { title: 'Output', rows: flattenScalars(state.output) },
      ]
    : [
        { rows: identity },
        { title: 'Attributes', rows: flattenScalars(state.attr) },
        { title: 'Properties', rows: flattenScalars(state.props) },
      ];
}

function StateItem({
  summary,
  storeId,
  stack,
  stage,
}: {
  summary: Summary;
  storeId: string;
  stack: string;
  stage: string;
}) {
  const [open, setOpen] = useState(false);
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['Explorer.GetResourceState']({
        storeId,
        stack,
        stage,
        resource: summary.fqn,
      }),
    ),
    rpcQueryKeys.resource(storeId, stack, stage, summary.fqn),
    { enabled: open },
  );
  const state = query.data?.data;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b border-border/70 last:border-b-0"
    >
      <CollapsibleTrigger
        className={`group/item grid min-h-12 w-full min-w-0 cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[1rem_minmax(0,1fr)_minmax(8rem,14rem)_7rem] ${open ? 'bg-muted/55' : 'hover:bg-muted/30'}`}
      >
        <ChevronRight
          className={`size-4 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        <ResourceName fqn={summary.fqn} />
        <span className="col-start-2 row-start-2 truncate text-xs text-muted-foreground sm:col-start-3 sm:row-start-1 sm:text-sm">
          {summary.type ?? 'Unknown type'}
        </span>
        <span className="col-start-3 row-span-2 row-start-1 sm:col-start-4 sm:row-span-1">
          <Status status={summary.status} />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/80 bg-background p-3">
          {query.error && (
            <QueryError
              message={query.error}
              stale={query.data !== null}
              pending={query.pending}
              onRetry={query.refresh}
            />
          )}
          {query.pending && !query.data && (
            <ListSkeleton label={`Loading ${summary.fqn}`} />
          )}
          {query.data && state === null && (
            <p className="text-sm text-muted-foreground">
              This item is no longer in the store. Refresh the stage to update
              the list.
            </p>
          )}
          {state && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <JsonButton
                  title={summary.fqn}
                  value={state}
                  label={`View ${summary.fqn} as JSON`}
                />
              </div>
              <KeyValueTable
                groups={stateGroups(summary, state)}
                empty="No readable values. Open the JSON to see everything."
              />
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
