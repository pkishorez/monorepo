import { Fragment } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Check,
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  Unlink,
} from 'kui-toolkit/lucide';
import type {
  deletionEvent,
  deletionPlan,
  forgottenResource,
} from '../../../../shared/contracts/deletion/index.ts';
import {
  providerLabels,
  providerOfResourceType,
  type ProviderKind,
} from '../../../../shared/contracts/credentials/index.ts';
import type { Analysis } from './preview.tsx';
import { SectionLabel } from './credentials.tsx';

type PlanResource = (typeof deletionPlan.Type)['resources'][number];
type Row = {
  id: string;
  type: string;
  analysis: Analysis['status'] | null;
  resource: PlanResource | null;
};

/** Alchemy drops the state row of a forgotten resource and leaves what it created behind. */
export const forgets = (resource: PlanResource, ignored: boolean) =>
  (resource.action === 'forget' && resource.type !== 'Action') || ignored;

/**
 * Rows keep the order they first appeared in during analysis, so a row that
 * streamed in as "Analyzing" becomes its planned self in place.
 */
const rowsOf = (
  analysis: readonly Analysis[],
  plan: typeof deletionPlan.Type | null,
): Row[] => {
  const planned = new Map(plan?.resources.map((r) => [r.id, r]) ?? []);
  const rows = analysis.map<Row>((entry) => ({
    id: entry.id,
    type: entry.type,
    analysis: entry.status,
    resource: planned.get(entry.id) ?? null,
  }));
  const seen = new Set(rows.map((row) => row.id));
  for (const resource of plan?.resources ?? [])
    if (!seen.has(resource.id))
      rows.push({
        id: resource.id,
        type: resource.type,
        analysis: null,
        resource,
      });
  return rows;
};

const groupOrder: (ProviderKind | 'other')[] = ['cloudflare', 'aws', 'other'];

export function ResourceList({
  analysis,
  plan,
  events,
  running,
  ignored,
  onIgnoreChange,
}: {
  analysis: readonly Analysis[];
  plan: typeof deletionPlan.Type | null;
  events: Record<string, typeof deletionEvent.Type>;
  running: boolean;
  ignored: (resource: typeof forgottenResource.Type) => boolean;
  /** Present until deletion starts; any blocked row can be skipped so Alchemy only drops its state. */
  onIgnoreChange?: (
    resource: typeof forgottenResource.Type,
    ignore: boolean,
  ) => void;
}) {
  const rows = rowsOf(analysis, plan);
  const groups = groupOrder
    .map((provider) => ({
      provider,
      rows: rows.filter(
        (row) => (providerOfResourceType(row.type) ?? 'other') === provider,
      ),
    }))
    .filter((group) => group.rows.length);
  const grouped = groups.length > 1;
  return (
    <section className="grid content-start gap-3">
      <SectionLabel>Resources</SectionLabel>
      {plan && !rows.length ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          No tracked resources. Alchemy removes the remaining stage state.
        </p>
      ) : (
        <div className="rounded-md border">
          {groups.map((group) => (
            <Fragment key={group.provider}>
              {grouped && (
                <p className="border-b bg-muted/40 px-4 py-1.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase first:rounded-t-md">
                  {group.provider === 'other'
                    ? 'Other'
                    : providerLabels[group.provider]}
                </p>
              )}
              {group.rows.map((row) => (
                <ResourceRow
                  key={row.id}
                  row={row}
                  event={events[row.id]}
                  running={running}
                  ignored={!!row.resource && ignored(row.resource)}
                  onIgnoreChange={onIgnoreChange}
                />
              ))}
            </Fragment>
          ))}
          {!rows.length && (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <LoaderCircle
                className="size-4 motion-safe:animate-spin"
                aria-hidden="true"
              />
              Reading stage state…
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const doneLabel: Record<string, string> = {
  deleted: 'Deleted',
  retained: 'Kept',
  fail: 'Failed',
  skipped: 'Skipped',
};

function ResourceRow({
  row,
  event,
  running,
  ignored,
  onIgnoreChange,
}: {
  row: Row;
  event: typeof deletionEvent.Type | undefined;
  running: boolean;
  ignored: boolean;
  onIgnoreChange?: (
    resource: typeof forgottenResource.Type,
    ignore: boolean,
  ) => void;
}) {
  const { resource } = row;
  const provider = providerOfResourceType(row.type);
  const status = event?.status;
  const done = status === 'deleted' || status === 'retained';
  const failedRun = status === 'fail' || status === 'skipped';
  const active = running && status !== undefined && !done && !failedRun;
  const blocked = !!resource && resource.readiness !== 'ready' && !ignored;
  const forgotten = !!resource && forgets(resource, ignored);
  const analyzing = row.analysis === 'analyzing' && !running;

  const icon =
    failedRun || row.analysis === 'failed' || blocked ? (
      <CircleAlert className="size-4 text-destructive" />
    ) : done ? (
      <Check className="size-4" />
    ) : active || analyzing ? (
      <LoaderCircle className="size-4 motion-safe:animate-spin" />
    ) : forgotten ? (
      <Unlink className="size-4 text-muted-foreground" />
    ) : resource?.action === 'retain' ? (
      <ShieldCheck className="size-4 text-muted-foreground" />
    ) : (
      <Trash2 className="size-4 text-muted-foreground" />
    );

  const word = status
    ? (doneLabel[status] ?? 'Deleting…')
    : row.analysis === 'failed'
      ? 'Failed'
      : analyzing || !resource
        ? 'Analyzing'
        : blocked
          ? 'Blocked'
          : forgotten
            ? 'Forget'
            : resource.action === 'retain'
              ? 'Keep'
              : 'Delete';
  const alarming = failedRun || row.analysis === 'failed' || blocked;

  const skip = resource && onIgnoreChange && (
    <Button
      variant="link"
      size="xs"
      className="h-auto px-0 text-xs"
      onClick={() =>
        onIgnoreChange({ id: resource.id, type: resource.type }, !ignored)
      }
    >
      {ignored ? 'Undo' : 'Skip and forget'}
    </Button>
  );
  const detail = !resource ? null : ignored ? (
    <>
      Alchemy stops tracking {row.id}. Whatever it created stays in{' '}
      {provider ? `your ${providerLabels[provider]} account` : 'place'} until
      you delete it yourself. {skip}
    </>
  ) : resource.readiness === 'missing-credentials' ? (
    <>
      Needs {provider === 'aws' ? 'an' : 'a'}{' '}
      {provider ? providerLabels[provider] : ''} credential. Choose one above,
      or {skip}
    </>
  ) : resource.readiness === 'unsupported' ? (
    <>
      {resource.reason ?? 'Console cannot delete this resource type.'} {skip}
    </>
  ) : resource.readiness === 'blocked' ? (
    <>
      {resource.reason ?? 'Alchemy cannot delete this resource right now.'}{' '}
      {skip}
    </>
  ) : forgotten ? (
    'Removed from Alchemy state only.'
  ) : null;

  return (
    <div className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-medium">{row.id}</span>
          <span className="text-xs text-muted-foreground">{row.type}</span>
        </p>
        {detail && (
          <p
            className={`mt-1 text-xs ${blocked ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {detail}
          </p>
        )}
        {!!resource?.previous.length && (
          <p className="mt-1 text-xs text-muted-foreground">
            {resource.previous.length === 1
              ? 'Also handles 1 previous version'
              : `Also handles ${resource.previous.length} previous versions`}
            {' · '}
            {resource.previous
              .map(
                (old) =>
                  `${old.type} (${old.action === 'retain' ? 'keep' : 'delete'})`,
              )
              .join(', ')}
          </p>
        )}
        {event?.message && (failedRun || done) && (
          <p
            className={`mt-1 text-xs ${failedRun ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {event.message}
          </p>
        )}
      </div>
      <span
        className={`w-20 shrink-0 text-right text-xs tabular-nums ${alarming ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {word}
      </span>
    </div>
  );
}
