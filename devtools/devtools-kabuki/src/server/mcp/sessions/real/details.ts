import { Effect } from 'effect';
import type { TabClient } from '../../../rpc/contract/index.ts';
import type { Change, Played } from '../../../rpc/session/contract/index.ts';
import type { Held } from './held.ts';

export interface Detail {
  readonly message: unknown;
  readonly commands: Played['commands'];
  readonly changes: ReadonlyArray<Change>;
}

export type Details = ReadonlyMap<number, Detail>;

export interface Drawn<A> {
  readonly drawn: A;
  readonly wanted: ReadonlyArray<number>;
}

export const changesOf = (details: Details) =>
  [...details.values()].flatMap(({ changes }) => changes);

export const NOTHING: Detail = {
  message: undefined,
  commands: [],
  changes: [],
};

const kept = new WeakMap<
  TabClient,
  { readonly epoch: string; readonly details: Map<number, Detail> }
>();

const detailOf = (client: TabClient, id: number) =>
  client.step({ at: id }).pipe(
    Effect.map(({ message, changes }): Detail =>
      message === null
        ? { ...NOTHING, changes }
        : { message: message.message, commands: message.commands, changes },
    ),
    Effect.catchTag('StepNotFound', () => Effect.succeed(NOTHING)),
  );

export const knownOf = (client: TabClient, { epoch, entries }: Held) => {
  const known = kept.get(client);
  const details =
    known?.epoch === epoch ? known.details : new Map<number, Detail>();
  for (const id of details.keys()) if (!entries.has(id)) details.delete(id);
  kept.set(client, { epoch, details });
  return details;
};

export const drawn = <A>(
  client: TabClient,
  held: Held,
  draw: (details: Details) => Drawn<A>,
) =>
  Effect.gen(function* () {
    const details = knownOf(client, held);
    while (true) {
      const { drawn: done, wanted } = draw(details);
      const missing = [...new Set(wanted)].filter((id) => !details.has(id));
      if (missing.length === 0) return done;
      const found = yield* Effect.forEach(
        missing,
        (id) => detailOf(client, id),
        { concurrency: 'unbounded' },
      );
      missing.forEach((id, at) => details.set(id, found[at]!));
    }
  });
