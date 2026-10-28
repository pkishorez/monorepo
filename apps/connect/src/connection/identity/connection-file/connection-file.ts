import { hostname } from 'node:os';
import { Data, Effect } from 'effect';
import {
  type ConnectionRecord,
  readConnection,
  removeConnection,
  writeConnection,
} from './record.js';
import { newConnectionId, newConnectionKey } from './secrets.js';

/*
 * Which Connection this is. Its `connection.json` is one Connection, signed
 * in as one User to one Cloud Connect: the first `serve` makes the
 * Connection, with a random id and Connection Key and the name it is given,
 * else the host's name, and every later start finds it again. The host's
 * name is cut at its first dot, so `Ada-MacBook.local` is `Ada-MacBook`; a
 * name kept with the whole of it takes the short one. A different User
 * signing in is refused, and so is another Cloud Connect; `remove` forgets
 * the Connection.
 */

/** This Connection belongs to another User. */
export class ConnectionOwnedByAnother extends Data.TaggedError(
  'ConnectionOwnedByAnother',
)<{ readonly file: string; readonly owner: string; readonly user: string }> {
  override get message() {
    return `${this.file} is the Connection of ${this.owner}, not ${this.user}. Run \`ke-connect remove <name>\` first, or serve another name.`;
  }
}

/** This Connection belongs to another Cloud Connect. */
export class ConnectionOfAnotherCloud extends Data.TaggedError(
  'ConnectionOfAnotherCloud',
)<{ readonly file: string; readonly cloud: string; readonly asked: string }> {
  override get message() {
    return `${this.file} is a Connection of ${this.cloud}, not ${this.asked}. Serve it with --cloud ${this.cloud}, or serve another name.`;
  }
}

/** The host's name up to its first dot: `Ada-MacBook.local` is `Ada-MacBook`. */
export const hostName = () => hostname().split('.')[0] || hostname();

/** A name kept with the whole of the host's name, with the short one. */
const shortened = (name: string) =>
  hostName() === hostname() ? name : name.replaceAll(hostname(), hostName());

/** Where a Connection is kept. */
export interface Kept {
  /** Its connection.json. */
  readonly file: string;
}

/** Fails unless the Connection kept, if any, belongs to `cloud`. */
export const ofCloud = (kept: Kept & { readonly cloud: string }) =>
  Effect.flatMap(readConnection(kept.file), (found) =>
    found === null || found.cloud === kept.cloud
      ? Effect.void
      : Effect.fail(
          new ConnectionOfAnotherCloud({
            file: kept.file,
            cloud: found.cloud,
            asked: kept.cloud,
          }),
        ),
  );

/**
 * The Connection kept, for `owner` on `cloud`, started at `startedAt`:
 * made on first use, named `firstName`, else the host's name. Fails when it
 * belongs to another User or another Cloud Connect.
 */
export const claim = (
  options: Kept & {
    readonly owner: { readonly id: string; readonly email: string };
    readonly cloud: string;
    readonly firstName?: string | undefined;
    readonly startedAt: number;
  },
) =>
  Effect.gen(function* () {
    yield* ofCloud(options);
    const found = yield* readConnection(options.file);
    if (found && found.owner.id !== options.owner.id)
      return yield* new ConnectionOwnedByAnother({
        file: options.file,
        owner: found.owner.email,
        user: options.owner.email,
      });
    // A Report carries at most 64 characters of name.
    const connection: ConnectionRecord = found
      ? {
          ...found,
          name: shortened(found.name).slice(0, 64),
          startedAt: options.startedAt,
        }
      : {
          id: newConnectionId(),
          name: (options.firstName ?? hostName()).slice(0, 64),
          key: newConnectionKey(),
          owner: options.owner,
          cloud: options.cloud,
          startedAt: options.startedAt,
        };
    if (JSON.stringify(connection) !== JSON.stringify(found))
      yield* writeConnection(options.file, connection);
    return { id: connection.id, name: connection.name, key: connection.key };
  });

/** The Connection kept, and its owner, without making one; null when there is none yet. */
export const found = (kept: Kept) => readConnection(kept.file);

/** Forgets the Connection kept, so the next start makes a new one. */
export const forget = (kept: Kept) => removeConnection(kept.file);
