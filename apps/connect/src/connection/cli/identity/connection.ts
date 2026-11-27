import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Data, Effect } from 'effect';
import { connection, type KeptConnection, type Store } from './store/index.js';

/*
 * Which Connection this is: the one ke-connect.db keeps, signed in as one
 * User to one Connect Cloud. The first `serve` makes it, with a random id
 * and the name it is given, else the host's name, and every later start
 * finds it again. The host's name is cut at its first dot, so
 * `Ada-MacBook.local` is `Ada-MacBook`; a name kept with the whole of it
 * takes the short one. A different User signing in is refused, and so is
 * another Connect Cloud; `remove` forgets the Connection.
 */

/** This Connection belongs to another User. */
export class ConnectionOwnedByAnother extends Data.TaggedError(
  'ConnectionOwnedByAnother',
)<{ readonly owner: string; readonly user: string }> {
  override get message() {
    return `This Connection is ${this.owner}'s, not ${this.user}'s. Run \`ke-connect remove <name>\` first, or serve another name.`;
  }
}

/** This Connection belongs to another Connect Cloud. */
export class ConnectionOfAnotherCloud extends Data.TaggedError(
  'ConnectionOfAnotherCloud',
)<{ readonly cloud: string; readonly asked: string }> {
  override get message() {
    return `This Connection is one of ${this.cloud}, not ${this.asked}. Serve it with --cloud ${this.cloud}, or serve another name.`;
  }
}

/** The host's name up to its first dot: `Ada-MacBook.local` is `Ada-MacBook`. */
export const hostName = () => hostname().split('.')[0] || hostname();

/** A name kept with the whole of the host's name, with the short one. */
const shortened = (name: string) =>
  hostName() === hostname() ? name : name.replaceAll(hostname(), hostName());

/** The Connection kept, and its owner, without making one; null when there is none yet. A store that fails is a defect. */
export const found = (store: Store) =>
  connection.get().pipe(
    Effect.map(({ value }) => value.connection),
    Effect.provide(store.table),
    Effect.orDie,
  );

const keep = (store: Store, kept: KeptConnection | null) =>
  connection
    .put({ connection: kept })
    .pipe(Effect.provide(store.table), Effect.orDie, Effect.asVoid);

/** Fails unless the Connection kept, if any, belongs to `cloud`. */
export const ofCloud = (store: Store, cloud: string) =>
  Effect.flatMap(found(store), (kept) =>
    kept === null || kept.cloud === cloud
      ? Effect.void
      : Effect.fail(
          new ConnectionOfAnotherCloud({ cloud: kept.cloud, asked: cloud }),
        ),
  );

/**
 * The Connection kept, for `owner` on `cloud`, started at `startedAt`:
 * made on first use, named `firstName`, else the host's name. Fails when it
 * belongs to another User or another Connect Cloud.
 */
export const claim = (
  store: Store,
  options: {
    readonly owner: { readonly id: string; readonly email: string };
    readonly cloud: string;
    readonly firstName?: string | undefined;
    readonly startedAt: number;
  },
) =>
  Effect.gen(function* () {
    yield* ofCloud(store, options.cloud);
    const kept = yield* found(store);
    if (kept && kept.owner.id !== options.owner.id)
      return yield* new ConnectionOwnedByAnother({
        owner: kept.owner.email,
        user: options.owner.email,
      });
    // A Report carries at most 64 characters of name.
    const claimed: KeptConnection = kept
      ? {
          ...kept,
          name: shortened(kept.name).slice(0, 64),
          startedAt: options.startedAt,
        }
      : {
          id: randomUUID(),
          name: (options.firstName ?? hostName()).slice(0, 64),
          owner: options.owner,
          cloud: options.cloud,
          startedAt: options.startedAt,
        };
    yield* keep(store, claimed);
    return { id: claimed.id, name: claimed.name };
  });

/** Forgets the Connection kept, so the next start makes a new one. */
export const forget = (store: Store) => keep(store, null);
