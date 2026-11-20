import { Effect } from 'effect';
import { oneDatabase } from './2026-11-one-database/index.js';

/*
 * Moves a Connection's data folder from a layout `ke-connect` no longer
 * writes to the one it does. Each migration is a folder named after the
 * month it shipped in, says the release it shipped in, and copies in the
 * old formats it reads rather than import them, so nothing else holds it in
 * place. `serve` and `remove` run `migrate` while they alone use the folder;
 * `list` never does.
 *
 * Deleting a migration is deleting its folder and its line here, once
 * `ke-connect` no longer supports upgrading from before its release. A
 * folder still in the old layout then keeps its old files, unread, and its
 * Connection starts anew.
 */

/** Runs every migration on the data folder `data`, in order. */
export const migrate = (data: string) =>
  Effect.all([oneDatabase(data)], { discard: true });
