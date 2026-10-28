import { Option, Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/eschema';

/*
 * How every side names one Release of a Plugin: by the Plugin's name and
 * the sha256 of its file. Code calls a Connection's Plugin at the Release
 * it was built with, `<tunnel>/<name>/<sha256>/rpc`. When the Connection
 * runs another, its router takes the socket and closes it at once with
 * `PLUGIN_MISMATCH`, the reason saying which hash runs: a browser cannot
 * read the status of a refused WebSocket, only how it closed. The file
 * itself is on the Shelf as `<name>/<sha256>.mjs`, under whichever root
 * holds it: Cloud Connect's `/plugins`, R2's `plugins/`, or a folder.
 *
 * Which `ke-connect` may run them is one value for every Plugin, the
 * Minimum Connect. A Connection below it is Outdated: it reports once, so
 * its User sees the version it runs, then stops, and an App says to
 * update `ke-connect`. The version every Report carries is what says so,
 * so a `ke-connect` too old to know the Minimum Connect is Outdated all
 * the same.
 */

/** A Plugin's name: a DNS label. */
const NAME = '[a-z0-9-]{1,64}';

/** A Release's hash: the sha256 of its file, in lowercase hex. */
const HASH = '[a-f0-9]{64}';

/** The sha256 of a Plugin's file, in lowercase hex. */
export const PluginHash = Schema.String.check(
  Schema.isPattern(new RegExp(`^${HASH}$`)),
);

/** A Plugin and the hash of one of its Releases. */
export interface PluginAt {
  readonly name: string;
  readonly hash: string;
}

const PATH = new RegExp(`^/(${NAME})/(${HASH})/rpc$`);

/** Where a Connection serves the Plugin `name` at the Release `hash`: `/<name>/<sha256>/rpc`, after its address. */
export const pluginPath = (name: string, hash: string) =>
  `/${name}/${hash}/rpc`;

/** The Plugin and hash a request's path asks for; null for any other path. */
export const pluginOfPath = (path: string): PluginAt | null => {
  const found = PATH.exec(path);
  return found === null ? null : { name: found[1]!, hash: found[2]! };
};

/** Where Cloud Connect serves the Shelf: `<cloud>/plugins/<name>/<sha256>.mjs`. R2 keeps each file at the same path. */
export const SHELF_PATH = '/plugins';

const KEY = new RegExp(`^(${NAME})/(${HASH})\\.mjs$`);

/** A Release's file on the Shelf, under any Shelf's root: `<name>/<sha256>.mjs`. */
export const shelfKey = (name: string, hash: string) => `${name}/${hash}.mjs`;

/** The Plugin and hash a Shelf key names; null for anything else. */
export const fromShelfKey = (key: string): PluginAt | null => {
  const found = KEY.exec(key);
  return found === null ? null : { name: found[1]!, hash: found[2]! };
};

/** The close code of a socket that asked for a Release the Connection does not run. */
export const PLUGIN_MISMATCH = 4409;

/**
 * Why a socket was closed with `PLUGIN_MISMATCH`, as its close reason
 * carries it in JSON: the hash the Connection runs, null when it runs none
 * yet. Short enough for a close reason, at most 123 bytes.
 */
export const PluginMismatch = ESchema.make('PluginMismatch', {
  running: Schema.NullOr(PluginHash),
}).build();
export type PluginMismatch = typeof PluginMismatch.Type;

const MismatchJson = Schema.fromJsonString(PluginMismatch.schema);

/** The close reason saying the Connection runs `running`. */
export const mismatchReason = (running: string | null): string =>
  Schema.encodeSync(MismatchJson)({ running });

/**
 * What a socket's close says of the Release asked for: null when it was
 * not closed with `PLUGIN_MISMATCH`. A reason this side cannot read, such
 * as a newer one, still says it is a mismatch, its hash unknown: null.
 */
export const mismatchOf = (close: {
  readonly code: number;
  readonly reason: string;
}): PluginMismatch | null =>
  close.code !== PLUGIN_MISMATCH
    ? null
    : Option.getOrElse(
        Schema.decodeUnknownOption(MismatchJson)(close.reason),
        () => ({ running: null }),
      );

/** A version's numbers, and whether it is a pre-release. */
const partsOf = (version: string) => {
  const [core = '', pre] = version.trim().replace(/^v/, '').split('-', 2);
  return {
    numbers: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
    pre: pre !== undefined,
  };
};

/** Whether `version` is older than `than`, as semver orders them. */
const olderThan = (version: string, than: string) => {
  const a = partsOf(version);
  const b = partsOf(than);
  for (let i = 0; i < Math.max(a.numbers.length, b.numbers.length); i++) {
    const x = a.numbers[i] ?? 0;
    const y = b.numbers[i] ?? 0;
    if (x !== y) return x < y;
  }
  return a.pre && !b.pre;
};

/** Whether a Connection at `version` is Outdated under `minConnect`; never when no minimum is known. */
export const belowMinimum = (version: string, minConnect: string | null) =>
  minConnect !== null && olderThan(version, minConnect);
