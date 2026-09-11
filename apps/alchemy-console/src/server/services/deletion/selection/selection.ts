import { createHash } from 'node:crypto';
import type { ProviderKind } from '../../../../shared/contracts/credentials/index.ts';
import { providerKinds } from '../../../../shared/contracts/credentials/index.ts';
import type {
  credentialChoice,
  credentialSelection,
} from '../../../../shared/contracts/deletion/index.ts';
import {
  locate,
  needsRegion,
  providerOf,
  supportsDeletion,
  type Credential,
} from '../../../providers/providers/index.ts';

type Row = { resourceType: string; props?: unknown; attr?: unknown };
export type Selection = {
  provider: ProviderKind;
  options: Credential[];
  selected: Credential | null;
  needsRegion: boolean;
  region: string | null;
  accounts: string[];
  regions: string[];
  resources: number;
};

const unique = (values: (string | null)[]) => [
  ...new Set(values.filter((value): value is string => value !== null)),
];

/**
 * Decides which credential each provider uses for this stage. The user's choice
 * wins; otherwise the credential whose account matches the recorded resources;
 * otherwise the store's own credential (Cloudflare) or the only option.
 */
export const select = (
  rows: readonly Row[],
  input: {
    available: readonly Credential[];
    stateCredentialId: string;
    choices?: readonly (typeof credentialChoice.Type)[] | null;
  },
): Selection[] => {
  const kinds = new Set<ProviderKind>(['cloudflare']);
  for (const row of rows) {
    const kind = providerOf(row.resourceType);
    if (kind && supportsDeletion(row.resourceType)) kinds.add(kind);
  }
  return providerKinds
    .filter((kind) => kinds.has(kind))
    .map((kind) => {
      const owned = rows.filter(
        (row) =>
          providerOf(row.resourceType) === kind &&
          supportsDeletion(row.resourceType),
      );
      const located = owned.map((row) => locate(row.resourceType, row));
      const accounts = unique(located.map((entry) => entry.account));
      const regions = unique(located.map((entry) => entry.region));
      const options = input.available.filter(
        (credential) => credential.secret.provider === kind,
      );
      const choice = input.choices?.find((entry) => entry.provider === kind);
      const chosen = choice
        ? (options.find((option) => option.id === choice.credentialId) ?? null)
        : undefined;
      const matching =
        accounts.length === 1
          ? options.filter((option) => option.account === accounts[0])
          : [];
      const selected =
        chosen !== undefined
          ? chosen
          : matching.length === 1
            ? matching[0]!
            : kind === 'cloudflare'
              ? (options.find(
                  (option) => option.id === input.stateCredentialId,
                ) ?? null)
              : options.length === 1
                ? options[0]!
                : null;
      const region = !needsRegion(kind)
        ? null
        : choice && choice.region !== undefined
          ? choice.region
          : regions.length === 1
            ? regions[0]!
            : null;
      return {
        provider: kind,
        options,
        selected,
        needsRegion: needsRegion(kind),
        region,
        accounts,
        regions,
        resources: owned.length,
      };
    });
};

export const selectionFor = (
  selections: readonly Selection[],
  kind: ProviderKind,
) => selections.find((selection) => selection.provider === kind) ?? null;

/** The browser-safe view: names and accounts, never secrets. */
export const toView = (
  selection: Selection,
): typeof credentialSelection.Type => ({
  provider: selection.provider,
  options: selection.options.map(({ id, name, account }) => ({
    id,
    name,
    account,
  })),
  selected: selection.selected?.id ?? null,
  needsRegion: selection.needsRegion,
  region: selection.region,
  accounts: selection.accounts,
  regions: selection.regions,
  resources: selection.resources,
});

/** Binds a review to the credentials it used without including them in the response. */
export const identity = (selection: Selection) => ({
  provider: selection.provider,
  credentialId: selection.selected?.id ?? null,
  account: selection.selected?.account ?? null,
  region: selection.region,
  secret: selection.selected
    ? createHash('sha256')
        .update(JSON.stringify(selection.selected.secret))
        .digest('hex')
    : null,
});
