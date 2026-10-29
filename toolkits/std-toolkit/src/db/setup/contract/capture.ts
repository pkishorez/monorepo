import { Effect } from 'effect';
import { TableSnapshot, type TableSource } from '../../../snapshot/index.js';

/**
 * Whether a physical table's data must survive every schema change
 * (`persistent`) or may be thrown away when one is not safe (`disposable`).
 */
export type TableMode = 'persistent' | 'disposable';

/** What a physical table keeps beside its data: the snapshot it was set up under. */
export interface StoredContract {
  readonly mode: TableMode;
  readonly hash: string;
  /** The serialized table snapshot. */
  readonly snapshot: unknown;
}

/** The current table, captured once for one setup. */
export interface CurrentContract {
  readonly logicalName: string;
  readonly snapshot: TableSnapshot;
  readonly record: StoredContract;
}

/** What a disposable table does with a change that needs a backfill. */
export type BackfillChoice = 'reindex' | 'wipe';

// cyrb53: a fast, non-cryptographic 53-bit hash. A collision only costs a
// skipped comparison, never a wrong one: an equal hash means equal JSON in
// every case a deploy will meet.
export const hash = (text: string) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// The type requires a mode; this catches a caller the types do not reach.
const requireMode = (table: string, mode: unknown) =>
  mode === 'persistent' || mode === 'disposable'
    ? Effect.void
    : Effect.die(
        new Error(
          `std-toolkit: table "${table}" has no mode. Declare it 'persistent' or 'disposable'.`,
        ),
      );

/** Captures the table's contract as setup records it. */
export const captureContract = (
  table: TableSource,
  mode: TableMode,
): Effect.Effect<CurrentContract> =>
  Effect.gen(function* () {
    yield* requireMode(table.logicalName, mode);
    const snapshot = TableSnapshot.capture(table);
    const serialized = yield* TableSnapshot.serialize(snapshot).pipe(
      Effect.orDie,
    );
    return {
      logicalName: table.logicalName,
      snapshot,
      record: {
        mode,
        hash: hash(JSON.stringify(serialized)),
        snapshot: serialized,
      },
    };
  });

/** Reads a contract already serialized, such as one carried by a deploy resource. */
export const contractFromSnapshot = (
  serialized: unknown,
  mode: TableMode,
): Effect.Effect<CurrentContract, unknown> =>
  Effect.gen(function* () {
    const snapshot = yield* TableSnapshot.parse(serialized);
    yield* requireMode(snapshot.logicalName, mode);
    return {
      logicalName: snapshot.logicalName,
      snapshot,
      record: {
        mode,
        hash: hash(JSON.stringify(serialized)),
        snapshot: serialized,
      },
    };
  });
