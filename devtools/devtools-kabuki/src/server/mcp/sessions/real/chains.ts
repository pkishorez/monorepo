import type {
  Change,
  Entry,
  Wanted,
} from '../../../rpc/session/contract/index.ts';
import type { Details } from './details.ts';
import type { NameOf } from './names.ts';
import { listed, tagOf } from './text.ts';

export interface Chain {
  readonly entries: ReadonlyArray<Entry>;
  readonly cut: boolean;
}

export const chainsOf = (line: ReadonlyArray<Entry>) => {
  const chains: Array<{ entries: Array<Entry>; cut: boolean }> = [];
  for (const entry of line) {
    const last = chains.at(-1);
    if (entry.from.kind === 'emit' && last !== undefined)
      last.entries.push(entry);
    else chains.push({ entries: [entry], cut: entry.from.kind === 'emit' });
  }
  return chains as ReadonlyArray<Chain>;
};

export const headOf = (chain: Chain) => chain.entries[0]!;

export const changesIn = (chain: Chain, details: Details) =>
  chain.entries.flatMap(({ id }) => details.get(id)?.changes ?? []);

export const sourceOf = ({ from, to }: Entry, name: NameOf) => {
  if (from.kind === 'outside') return from.name ?? 'outside';
  const what =
    from.kind === 'view' || from.kind === 'provides'
      ? from.kind
      : from.kind === 'worker' && from.key !== undefined && from.key !== ''
        ? `worker ${from.name}[${from.key}]`
        : `${from.kind} ${from.name}`;
  return from.instance === to ? what : `${what} of ${name(from.instance)}`;
};

const workerText = ({ name, key }: Wanted) =>
  key === undefined || key === '' ? name : `${name}[${key}]`;

const within = (address: string, outer: ReadonlySet<string>) => {
  for (const one of outer) if (address.startsWith(`${one}/`)) return true;
  return false;
};

const stateText = (state: unknown) => tagOf(state) ?? '?';

const changedParts = (change: Extract<Change, { _tag: 'Changed' }>) => {
  const { state, model, props, workers } = change;
  const fields = (record: Readonly<Record<string, unknown>>) =>
    Object.keys(record);
  return [
    ...(state === undefined
      ? []
      : [
          state.transition
            ? `State ${stateText(state.before)}→${stateText(state.after)}`
            : `State ${stateText(state.after)} data`,
        ]),
    ...(fields(model).length === 0 ? [] : [`model ${listed(fields(model))}`]),
    ...(fields(props).length === 0 ? [] : [`props ${listed(fields(props))}`]),
    ...(workers.started.length === 0
      ? []
      : [`worker ${listed(workers.started.map(workerText))} started`]),
    ...(workers.stopped.length === 0
      ? []
      : [`worker ${listed(workers.stopped.map(workerText))} stopped`]),
  ];
};

export const summaryOf = (
  changes: ReadonlyArray<Change>,
  home: string,
  name: NameOf,
) => {
  const added = new Set(
    changes.flatMap((one) => (one._tag === 'Added' ? [one.address] : [])),
  );
  const removed = new Set(
    changes.flatMap((one) => (one._tag === 'Removed' ? [one.address] : [])),
  );
  const groups = new Map<string, Set<string>>();
  const put = (key: string, parts: ReadonlyArray<string>) => {
    const group = groups.get(key) ?? new Set<string>();
    for (const part of parts) group.add(part);
    groups.set(key, group);
  };
  for (const change of changes) {
    if (change._tag === 'Changed') {
      put(
        change.address === home ? '' : `${name(change.address)}: `,
        changedParts(change),
      );
      continue;
    }
    const outer = change._tag === 'Added' ? added : removed;
    if (within(change.address, outer)) continue;
    const under = [...outer].filter((one) =>
      one.startsWith(`${change.address}/`),
    ).length;
    const sign = change._tag === 'Added' ? '+' : '−';
    put(`${sign}${name(change.address)}`, [
      under === 0 ? '' : ` (+${under} under)`,
    ]);
  }
  return [...groups.entries()].flatMap(([key, parts]) => {
    const whole = key.startsWith('+') || key.startsWith('−');
    const text = [...parts].join(whole ? '' : ', ');
    return whole || text !== '' ? [`${key}${text}`] : [];
  });
};

const outcomeText = ({ outcome }: Entry) =>
  outcome === 'handled' ? '' : ` [${outcome}]`;

export const chainLine = (chain: Chain, name: NameOf, details: Details) => {
  const [first, ...emits] = chain.entries;
  const head = first!;
  const summary = [
    ...summaryOf(changesIn(chain, details), head.to, name),
    ...chain.entries.flatMap((one) =>
      (details.get(one.id)?.commands ?? []).map(
        (command) =>
          `${one.to === head.to ? '' : `${name(one.to)}: `}command ${command.name}`,
      ),
    ),
  ];
  return [
    `${head.id}${chain.cut ? ' (cut)' : ''}  ${sourceOf(head, name)}  ${head.tag} → ${name(head.to)}${outcomeText(head)}`,
    ...emits.map((one) => ` → ${name(one.to)}: ${one.tag}${outcomeText(one)}`),
    `  · ${summary.length === 0 ? 'no change' : summary.join('; ')}`,
  ].join('');
};

export const keyOf = (chain: Chain, name: NameOf) => {
  const head = headOf(chain);
  return chain.entries.length === 1 && !head.changed
    ? `${sourceOf(head, name)}|${head.tag}|${head.to}|${head.outcome}`
    : undefined;
};

export const foldedLine = (chains: ReadonlyArray<Chain>, name: NameOf) => {
  const ids = chains.map((chain) => headOf(chain).id);
  const one = headOf(chains[0]!);
  return `${Math.min(...ids)}–${Math.max(...ids)}  ${sourceOf(one, name)}  ${one.tag} → ${name(one.to)}${outcomeText(one)} ×${chains.length}  · no change`;
};
