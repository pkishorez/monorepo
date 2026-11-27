import type { Entry, Watched } from '../../../rpc/session/contract/index.ts';

const LAST = 10;

const fromOf = ({ from, to }: Entry, nameOf: (address: string) => string) => {
  if (from.kind === 'outside') return from.name ?? 'outside';
  const what =
    from.kind === 'view' || from.kind === 'provides'
      ? from.kind
      : from.kind === 'worker' && from.key !== undefined && from.key !== ''
        ? `worker ${from.name} ${from.key}`
        : `${from.kind} ${from.name}`;
  return from.instance === to ? what : `${what} of ${nameOf(from.instance)}`;
};

export const timelineOf = (
  { now, entries }: Watched,
  before?: number,
  nameOf: (address: string) => string = (address) => address,
) => {
  const kept =
    before === undefined
      ? entries
      : entries.filter((entry) => entry.id < before);
  return {
    now: {
      head: now.head,
      seeking: now.seeking,
      failure: now.failure,
      url: now.url,
    },
    last: kept.slice(-LAST).map((entry) => ({
      id: entry.id,
      tag: entry.tag,
      to: nameOf(entry.to),
      from: fromOf(entry, nameOf),
      outcome: entry.outcome,
    })),
  };
};
