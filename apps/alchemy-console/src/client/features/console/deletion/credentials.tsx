import { useId, useState } from 'react';
import { Input } from 'kui-toolkit/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'kui-toolkit/components/ui/select';
import { Skeleton } from 'kui-toolkit/components/ui/skeleton';
import type {
  credentialSelection,
  deletionPlan,
} from '../../../../shared/contracts/deletion/index.ts';
import {
  providerLabels,
  type ProviderKind,
} from '../../../../shared/contracts/credentials/index.ts';

export type CredentialChange = {
  credentialId?: string | null;
  region?: string | null;
};

export const SectionLabel = ({ children }: { children: string }) => (
  <h3 className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
    {children}
  </h3>
);

/** Shortens account IDs (`d81fbf7c…b09493`) while leaving short ones alone. */
export const shortAccount = (account: string) =>
  account.length > 16 ? `${account.slice(0, 8)}…${account.slice(-6)}` : account;

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** One row per provider in the plan. Two skeleton rows hold the space before the plan lands. */
export function DeleteUsing({
  plan,
  onChange,
}: {
  plan: typeof deletionPlan.Type | null;
  onChange?: (provider: ProviderKind, change: CredentialChange) => void;
}) {
  return (
    <section className="grid min-h-[6.25rem] content-start gap-3">
      <SectionLabel>Delete using</SectionLabel>
      {plan ? (
        plan.credentials.map((selection) => (
          <CredentialRow
            key={selection.provider}
            selection={selection}
            onChange={
              onChange && ((change) => onChange(selection.provider, change))
            }
          />
        ))
      ) : (
        <div
          role="status"
          aria-label="Loading credentials"
          className="grid gap-3"
        >
          {[0, 1].map((row) => (
            <div
              key={row}
              className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3"
            >
              <Skeleton className="h-4 w-16 motion-reduce:animate-none" />
              <Skeleton className="h-9 w-full motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CredentialRow({
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
  // The recorded account only matters when the chosen credential is a different one.
  const recorded = selection.accounts.filter(
    (account) => account !== selected?.account,
  );
  const hint = [
    recorded.length
      ? `Recorded on ${recorded.map(shortAccount).join(', ')}`
      : null,
    selection.needsRegion &&
    selection.regions.length &&
    !selection.regions.includes(region)
      ? `Recorded in ${selection.regions.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
      <label htmlFor={`${id}-credential`} className="pt-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          {selection.resources
            ? plural(selection.resources, 'resource')
            : 'State only'}
        </span>
      </label>
      <div className="grid gap-1.5">
        <div className="flex gap-2">
          <Select
            value={selection.selected}
            items={Object.fromEntries(
              selection.options.map((option) => [
                option.id,
                `${option.name} · ${shortAccount(option.account)}`,
              ]),
            )}
            disabled={!onChange || !selection.options.length}
            onValueChange={(value) => onChange?.({ credentialId: value })}
          >
            <SelectTrigger
              id={`${id}-credential`}
              className="min-w-0 flex-1"
              aria-invalid={!selected || undefined}
            >
              <SelectValue
                placeholder={
                  selection.options.length
                    ? `Choose a ${label} credential`
                    : `No ${label} credential granted to this store`
                }
              />
            </SelectTrigger>
            <SelectContent
              alignItemWithTrigger={false}
              className="bg-[color-mix(in_oklch,var(--popover),var(--foreground)_5%)] shadow-lg ring-foreground/15"
            >
              {selection.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                  <span className="text-muted-foreground">
                    {shortAccount(option.account)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selection.needsRegion && (
            <Input
              aria-label={`${label} region`}
              className="w-32 shrink-0"
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
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
