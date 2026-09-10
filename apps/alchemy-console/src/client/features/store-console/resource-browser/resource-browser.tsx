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
import { Box, Braces, ChevronRight, Search } from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import {
  EmptyState,
  ListSkeleton,
  QueryError,
} from '../../query-feedback/index.ts';
import {
  extractStateDetails,
  PaneHeader,
  RawDataDialog,
  ReadableValue,
  RefreshButton,
  ResourceName,
  Status,
  toReadableNode,
} from '../state-view/index.ts';
import { rpcQueryKeys, useRpcQuery } from '../store-query/index.ts';

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
      rpc['AlchemyStateStore.GetStageView']({ storeId, stack, stage }),
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
        meta={
          query.data
            ? `${rows.length} item${rows.length === 1 ? '' : 's'} in this stage`
            : undefined
        }
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
          <div className="space-y-5">
            {rows.length > 0 && (
              <div className="space-y-1.5">
                <label
                  htmlFor="stage-item-filter"
                  className="text-sm font-medium"
                >
                  Search resources and actions
                </label>
                <div className="relative max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="stage-item-filter"
                    placeholder="Name or type"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    className="pl-9"
                  />
                </div>
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
                count={resources.length}
                rows={resources}
                storeId={storeId}
                stack={stack}
                stage={stage}
              />
            )}
            {actions.length > 0 && (
              <StateSection
                title="Actions"
                count={actions.length}
                rows={actions}
                storeId={storeId}
                stack={stack}
                stage={stage}
              />
            )}
          </div>

          <OutputsSection value={query.data.data.outputs} />
        </>
      )}
    </div>
  );
}

function StateSection({
  title,
  count,
  rows,
  ...target
}: {
  title: string;
  count: number;
  rows: ReadonlyArray<Summary>;
  storeId: string;
  stack: string;
  stage: string;
}) {
  return (
    <section
      aria-labelledby={`${title.toLocaleLowerCase()}-heading`}
      className="space-y-3"
    >
      <div className="flex items-baseline gap-2">
        <h2
          id={`${title.toLocaleLowerCase()}-heading`}
          className="text-sm font-semibold"
        >
          {title}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg bg-card shadow-raised">
        {rows.map((row) => (
          <StateItem key={row.fqn} summary={row} {...target} />
        ))}
      </div>
    </section>
  );
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
  const [rawOpen, setRawOpen] = useState(false);
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.GetResourceState']({
        storeId,
        stack,
        stage,
        resource: summary.fqn,
      }),
    ),
    rpcQueryKeys.resource(storeId, stack, stage, summary.fqn),
    { enabled: open || rawOpen },
  );
  const state = query.data?.data;
  const details = state ? extractStateDetails(state) : null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b border-border/70 last:border-b-0"
    >
      <div
        className={`flex min-h-14 items-stretch transition-colors duration-150 ${open ? 'bg-muted/55' : 'hover:bg-muted/30'}`}
      >
        <CollapsibleTrigger className="group/item grid min-w-0 flex-1 cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[1rem_minmax(0,1fr)_minmax(8rem,14rem)_7rem]">
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="m-1.5 shrink-0 self-center text-muted-foreground hover:text-foreground"
          onClick={() => setRawOpen(true)}
          aria-label={`View raw state for ${summary.fqn}`}
          title="View raw state"
        >
          <Braces />
        </Button>
      </div>
      <CollapsibleContent>
        <div className="space-y-6 border-t border-border/80 bg-background px-4 py-5 sm:px-7 sm:py-6">
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
          {details && (
            <>
              <div className="rounded-md bg-muted/25 p-3">
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {details.metadata.map((item) => (
                    <div key={item.label} className="grid min-w-0 gap-0.5">
                      <dt className="text-xs text-muted-foreground">
                        {item.label}
                      </dt>
                      <dd
                        className="truncate font-mono text-xs tabular-nums"
                        title={String(item.value)}
                      >
                        {String(item.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              {details.sections.map((section) => (
                <section key={section.title} className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </h3>
                  <ReadableValue node={section.value} />
                </section>
              ))}
            </>
          )}
        </div>
      </CollapsibleContent>
      <RawDataDialog
        open={rawOpen}
        onOpenChange={setRawOpen}
        title={summary.fqn}
        description="Complete masked state from the selected stage."
        value={state}
        pending={query.pending}
        error={query.error}
        onRetry={query.refresh}
      />
    </Collapsible>
  );
}

function OutputsSection({ value }: { value: unknown }) {
  const [rawOpen, setRawOpen] = useState(false);
  return (
    <section aria-labelledby="outputs-heading" className="space-y-3">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 id="outputs-heading" className="text-sm font-semibold">
          Outputs
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setRawOpen(true)}
          aria-label="View raw stage outputs"
          title="View raw outputs"
        >
          <Braces />
        </Button>
      </div>
      {value === null ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
          This stage has no outputs.
        </p>
      ) : (
        <ReadableValue node={toReadableNode(value)} />
      )}
      <RawDataDialog
        open={rawOpen}
        onOpenChange={setRawOpen}
        title="Stage outputs"
        description="Complete masked outputs exported by this stage."
        value={value}
      />
    </section>
  );
}
