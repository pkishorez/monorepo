import {
  Check,
  LoaderCircle,
  ShieldCheck,
  CircleAlert,
  Trash2,
} from 'kui-toolkit/lucide';
import type {
  deletionPlan,
  deletionEvent,
} from '../../../shared/contracts/delete-stage/index.ts';

const statusLabel: Record<string, string> = {
  deleted: 'Deleted',
  retained: 'Kept',
  fail: 'Failed',
  skipped: 'Skipped',
};

export function PlanView({
  plan,
  events,
  running,
}: {
  plan: typeof deletionPlan.Type;
  events: Record<string, typeof deletionEvent.Type>;
  running: boolean;
}) {
  const deleted = plan.resources.filter((r) => r.action === 'delete').length;
  const retained = plan.resources.filter((r) => r.action === 'retain').length;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-md bg-muted/40 p-4 text-sm">
        <dt className="text-muted-foreground">Cloudflare account</dt>
        <dd className="break-all font-mono text-xs">{plan.accountId}</dd>
        <dt className="text-muted-foreground">Stack</dt>
        <dd className="break-all font-medium">{plan.stack}</dd>
        <dt className="text-muted-foreground">Stage</dt>
        <dd className="break-all font-medium">{plan.stage}</dd>
      </dl>
      <p className="text-sm text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{deleted}</span> to delete
        {' · '}
        <span className="font-medium text-foreground">{retained}</span> to keep
        {' · '}
        <span className="font-medium text-foreground">
          {plan.resources.length}
        </span>{' '}
        tracked
      </p>
      <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
        {plan.resources.map((resource) => {
          const event = events[resource.id];
          const status = event?.status;
          const done = status === 'deleted' || status === 'retained';
          const active =
            running &&
            status !== undefined &&
            !done &&
            status !== 'fail' &&
            status !== 'skipped';
          return (
            <div key={resource.id} className="flex gap-3 p-4">
              <span className="mt-0.5 shrink-0">
                {status === 'fail' || status === 'skipped' ? (
                  <CircleAlert className="size-4 text-destructive" />
                ) : done ? (
                  <Check className="size-4" />
                ) : active ? (
                  <LoaderCircle className="size-4 motion-safe:animate-spin" />
                ) : resource.action === 'retain' ? (
                  <ShieldCheck className="size-4 text-muted-foreground" />
                ) : (
                  <Trash2 className="size-4 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium">{resource.id}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {resource.type}
                </p>
                {!!resource.after.length && (
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    After: {resource.after.join(', ')}
                  </p>
                )}
                {!!resource.previous.length && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {resource.previous.map((old, i) => (
                      <li key={i}>
                        Previous version {i + 1}: {old.type},{' '}
                        {old.action === 'retain' ? 'keep' : 'delete'}
                      </li>
                    ))}
                  </ul>
                )}
                {event?.message && (
                  <p className="mt-1 text-xs text-destructive">
                    {event.message}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 text-xs ${status === 'fail' || status === 'skipped' ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {status
                  ? statusLabel[status]
                  : resource.action === 'retain'
                    ? 'Keep'
                    : resource.action === 'forget'
                      ? 'Stop tracking'
                      : 'Delete'}
              </span>
            </div>
          );
        })}
        {!plan.resources.length && (
          <p className="p-4 text-sm text-muted-foreground">
            No tracked resources. Alchemy will remove the remaining stage state.
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Alchemy controls deletion order and updates state as it proceeds.
        Retained resources stay in Cloudflare and are removed from Alchemy’s
        tracking. Deleted resources and their data cannot be restored by this
        dialog.
      </p>
    </div>
  );
}
