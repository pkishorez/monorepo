import {
  Check,
  LoaderCircle,
  ShieldCheck,
  CircleAlert,
  Trash2,
} from 'kui-toolkit/lucide';
import { Checkbox } from 'kui-toolkit/components/ui/checkbox';
import { Input } from 'kui-toolkit/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from 'kui-toolkit/components/ui/native-select';
import { useId, useState } from 'react';
import type {
  credentialSelection,
  deletionPlan,
  deletionEvent,
  forgottenResource,
} from '../../../../shared/contracts/deletion/index.ts';
import {
  providerLabels,
  type ProviderKind,
} from '../../../../shared/contracts/credentials/index.ts';

type CredentialChange = {
  credentialId?: string | null;
  region?: string | null;
};

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
  ignored,
  onIgnoreChange,
  onCredentialChange,
}: {
  plan: typeof deletionPlan.Type;
  events: Record<string, typeof deletionEvent.Type>;
  running: boolean;
  ignored: (resource: typeof forgottenResource.Type) => boolean;
  /** Present until deletion starts; any blocked row can be ignored so Alchemy only drops its state. */
  onIgnoreChange?: (
    resource: typeof forgottenResource.Type,
    ignore: boolean,
  ) => void;
  /** Present until deletion starts; changing a credential re-plans the stage. */
  onCredentialChange?: (
    provider: ProviderKind,
    change: CredentialChange,
  ) => void;
}) {
  const deleted = plan.resources.filter((r) => r.action === 'delete').length;
  const retained = plan.resources.filter((r) => r.action === 'retain').length;
  const forgotten = plan.resources.filter(
    (r) =>
      (r.action === 'forget' && r.type !== 'Action') ||
      (r.readiness !== 'ready' && ignored(r)),
  ).length;
  const unresolved = plan.resources.some(
    (r) => r.readiness !== 'ready' && !ignored(r),
  );
  const ignoring = plan.resources.some(
    (r) => r.readiness !== 'ready' && ignored(r),
  );
  return (
    <div className="space-y-4">
      {!plan.executable && unresolved && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          Deletion is blocked. Resolve the resource issues below, then review
          again. No resources have been deleted.
        </p>
      )}
      {!plan.executable && (unresolved || ignoring) && (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <span className="font-medium">
            Only if you know what you are doing.
          </span>{' '}
          A blocked resource can be ignored instead. Alchemy then removes it
          from state without deleting it, and whatever it created stays behind
          as an orphan you must clean up yourself.
        </p>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-md bg-muted/40 p-4 text-sm">
        <dt className="text-muted-foreground">Stack</dt>
        <dd className="break-all font-medium">{plan.stack}</dd>
        <dt className="text-muted-foreground">Stage</dt>
        <dd className="break-all font-medium">{plan.stage}</dd>
      </dl>
      <section className="space-y-3 rounded-md border p-4">
        <div>
          <h3 className="text-sm font-medium">Delete with</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Which credential each provider uses for this stage. Defaults come
            from the accounts recorded on its resources.
          </p>
        </div>
        {plan.credentials.map((selection) => (
          <CredentialPicker
            key={selection.provider}
            selection={selection}
            onChange={
              onCredentialChange &&
              ((change) => onCredentialChange(selection.provider, change))
            }
          />
        ))}
      </section>
      <p className="text-sm text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{deleted}</span> to delete
        {' · '}
        <span className="font-medium text-foreground">{retained}</span> to keep
        {forgotten > 0 && (
          <>
            {' · '}
            <span className="font-medium text-foreground">{forgotten}</span> to
            remove from state
          </>
        )}
        {' · '}
        <span className="font-medium text-foreground">
          {plan.resources.length}
        </span>{' '}
        tracked
      </p>
      {/* The dialog body scrolls as a whole; a second capped region here would nest scrolling. */}
      <div className="rounded-md border">
        <div className="divide-y">
          {plan.resources.map((resource, index) => {
            const event = events[resource.id];
            const status = event?.status;
            const ignore = resource.readiness !== 'ready' && ignored(resource);
            const forgets =
              (resource.action === 'forget' && resource.type !== 'Action') ||
              ignore;
            const done = status === 'deleted' || status === 'retained';
            const active =
              running &&
              status !== undefined &&
              !done &&
              status !== 'fail' &&
              status !== 'skipped';
            return (
              <div key={`${resource.id}-${index}`} className="flex gap-3 p-4">
                <span className="mt-0.5 shrink-0">
                  {resource.readiness !== 'ready' ||
                  status === 'fail' ||
                  status === 'skipped' ? (
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
                  <p
                    className={`mt-1 text-xs ${resource.reason ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {forgets && resource.readiness === 'ready'
                      ? 'Removed from Alchemy state only'
                      : resource.readiness === 'ready'
                        ? 'Supported and configured'
                        : resource.readiness === 'missing-credentials'
                          ? 'Supported · credential needed'
                          : resource.readiness === 'unsupported'
                            ? 'Unsupported'
                            : 'Blocked'}
                    {resource.reason && ` — ${resource.reason}`}
                  </p>
                  {resource.readiness !== 'ready' && onIgnoreChange && (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs">
                      <Checkbox
                        className="mt-0.5"
                        checked={ignore}
                        onCheckedChange={(checked) =>
                          onIgnoreChange(
                            { id: resource.id, type: resource.type },
                            checked === true,
                          )
                        }
                      />
                      <span>
                        {resource.readiness === 'unsupported'
                          ? 'Ignore this resource and remove it from Alchemy state. Whatever it created stays as it is.'
                          : 'I know what I am doing: remove this resource from Alchemy state without deleting it. Whatever it created stays behind.'}
                      </span>
                    </label>
                  )}
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
                      : forgets
                        ? 'Remove from state'
                        : 'Delete'}
                </span>
              </div>
            );
          })}
          {!plan.resources.length && (
            <p className="p-4 text-sm text-muted-foreground">
              No tracked resources. Alchemy will remove the remaining stage
              state.
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Alchemy controls deletion order and updates state as it proceeds.
        Retained resources stay in their cloud account and are removed from
        Alchemy’s tracking. Deleted resources and their data cannot be restored
        by this dialog.
      </p>
    </div>
  );
}

function CredentialPicker({
  selection,
  onChange,
}: {
  selection: typeof credentialSelection.Type;
  onChange?: (change: CredentialChange) => void;
}) {
  const id = useId();
  const label = providerLabels[selection.provider];
  const [region, setRegion] = useState(selection.region ?? '');
  const selected = selection.options.find(
    (option) => option.id === selection.selected,
  );
  const hint = [
    selection.resources
      ? `${selection.resources} resource${selection.resources === 1 ? '' : 's'}`
      : 'state only',
    selection.accounts.length
      ? `recorded in ${selection.accounts.join(', ')}`
      : null,
    selection.regions.length ? selection.regions.join(', ') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start">
      <label htmlFor={`${id}-credential`} className="pt-2 text-sm font-medium">
        {label}
      </label>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <NativeSelect
            className="min-w-0 flex-1"
            id={`${id}-credential`}
            value={selection.selected ?? ''}
            disabled={!onChange}
            onChange={(event) =>
              onChange?.({ credentialId: event.target.value || null })
            }
            aria-invalid={!selected || undefined}
          >
            <NativeSelectOption value="">
              {selection.options.length
                ? `Choose a ${label} credential`
                : `No ${label} credential granted to this store`}
            </NativeSelectOption>
            {selection.options.map((option) => (
              <NativeSelectOption key={option.id} value={option.id}>
                {option.name} · {option.account}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {selection.needsRegion && (
            <Input
              aria-label={`${label} region`}
              className="w-36"
              placeholder="us-east-1"
              autoCapitalize="none"
              spellCheck={false}
              value={region}
              disabled={!onChange}
              aria-invalid={!selection.region || undefined}
              onChange={(event) => setRegion(event.target.value)}
              onBlur={() => {
                const next = region.trim();
                if (next !== (selection.region ?? ''))
                  onChange?.({ region: next || null });
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
