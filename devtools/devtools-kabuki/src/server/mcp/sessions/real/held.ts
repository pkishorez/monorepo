import { Effect, Option, Stream } from 'effect';
import type { TabClient } from '../../../rpc/contract/index.ts';
import type { Entry, Now, Told } from '../../../rpc/session/contract/index.ts';

export interface Held {
  readonly now: Now;
  readonly epoch: string;
  readonly entries: ReadonlyMap<number, Entry>;
  readonly roots: ReadonlySet<number>;
  readonly newest: number | null;
}

const helds = new WeakMap<TabClient, Held>();

export const heldWith = (held: Held | undefined, batch: Told): Held => {
  const entries = new Map(
    held === undefined || held.epoch !== batch.epoch ? [] : held.entries,
  );
  for (const entry of batch.entries) entries.set(entry.id, entry);
  const oldest = Math.min(...batch.roots);
  if (batch.roots.length > 0)
    for (const id of entries.keys()) if (id < oldest) entries.delete(id);
  const newest = batch.entries.reduce<number | null>(
    (most, { id }) => (most === null || id > most ? id : most),
    held?.epoch === batch.epoch ? held.newest : null,
  );
  return {
    now: batch.now,
    epoch: batch.epoch,
    entries,
    roots: new Set(batch.roots),
    newest,
  };
};

export const heldOf = (client: TabClient) =>
  Effect.gen(function* () {
    const held = helds.get(client);
    const from =
      held === undefined
        ? {}
        : { from: { epoch: held.epoch, after: held.newest } };
    const batch = yield* Stream.runHead(client.history(from));
    if (Option.isNone(batch)) return Option.none<Held>();
    const next = heldWith(helds.get(client), batch.value);
    helds.set(client, next);
    return Option.some(next);
  });

export const branchOf = ({ entries, roots, now }: Held) => {
  const line: Array<Entry> = [];
  let id = now.head;
  while (id !== null) {
    const entry = entries.get(id);
    if (entry === undefined) break;
    line.push(entry);
    if (roots.has(id)) break;
    id = entry.parent;
  }
  return line.reverse();
};

export const lineThrough = ({ entries, roots }: Held, id: number) => {
  const line: Array<Entry> = [];
  let back: number | null = id;
  while (back !== null) {
    const entry = entries.get(back);
    if (entry === undefined) break;
    line.unshift(entry);
    if (roots.has(back)) break;
    back = entry.parent;
  }
  if (line.length === 0) return line;
  const after = [...entries.values()];
  let last = line.at(-1)!;
  while (true) {
    const emitted = after.find(
      ({ parent, from }) => parent === last.id && from.kind === 'emit',
    );
    if (emitted === undefined) return line;
    line.push(emitted);
    last = emitted;
  }
};

export const changedSince = (held: Held, after: number | null) => {
  let newest: number | null = null;
  for (const { id, changed } of held.entries.values())
    if ((after === null || id > after) && changed)
      newest = newest === null || id > newest ? id : newest;
  return newest;
};
