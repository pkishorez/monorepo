import { Effect } from 'effect';
import { TableSnapshot, type TableSource } from '../../snapshot/index.js';
import type { JsonValue, StoredItem } from '../std-table/contract/index.js';
import type { TableMode } from './refusal.js';
import { splitTableSnapshot } from './split.js';

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** JSON with its keys sorted, so key order never reads as a change. */
export const canonical = (value: JsonValue): string =>
  JSON.stringify(value, (_, each: unknown) =>
    typeof each === 'object' && each !== null && !Array.isArray(each)
      ? Object.fromEntries(
          Object.entries(each).sort(([a], [b]) => compare(a, b)),
        )
      : each,
  );

const captured = new WeakMap<
  object,
  { readonly count: number; readonly snapshot: TableSnapshot }
>();

/**
 * The table's snapshot, captured once per table while no entity registers:
 * entities may register after the table is built, so a new count captures
 * again.
 */
export const captureTable = (table: TableSource): TableSnapshot => {
  const count = table.registeredEntities.length;
  const found = captured.get(table);
  if (found !== undefined && found.count === count) return found.snapshot;
  const snapshot = TableSnapshot.capture(table);
  captured.set(table, { count, snapshot });
  return snapshot;
};

const hashes = new WeakMap<TableSnapshot, Map<string, Promise<string>>>();

const sha256 = async (text: string) => {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};

/**
 * The SHA-256, in hex, of every value the internal entities' items hold for
 * this snapshot, the order of the local secondary indexes included, but the
 * mode, which `__snapshot` holds beside it. Equal hashes mean equal items.
 * It is cryptographic because an unchanged table is taken on its hash alone:
 * a collision would skip a check. Computed once per snapshot and order.
 */
export const snapshotHash = (
  snapshot: TableSnapshot,
  localIndexOrder: readonly string[] = [],
): Effect.Effect<string> =>
  Effect.promise(() => {
    const byOrder = hashes.get(snapshot) ?? new Map<string, Promise<string>>();
    hashes.set(snapshot, byOrder);
    const order = JSON.stringify(localIndexOrder);
    const found = byOrder.get(order);
    if (found !== undefined) return found;
    const {
      snapshot: record,
      entities,
      versions,
    } = splitTableSnapshot(snapshot, 'persistent', localIndexOrder);
    // The mode is compared beside the hash, and the hash is not its own input.
    const table = { ...record, mode: null, hash: null };
    const hash = sha256(
      canonical({
        snapshot: table,
        entities,
        versions,
      } as unknown as JsonValue),
    );
    byOrder.set(order, hash);
    return hash;
  });

/**
 * Whether `__snapshot` holds the code's hash and mode: every other item is
 * then as the code has it, so nothing else needs reading.
 */
export const isCurrent = (
  record: StoredItem | null,
  hash: string,
  mode: TableMode,
): boolean =>
  record !== null &&
  !record.meta._d &&
  record.data.hash === hash &&
  record.data.mode === mode;
