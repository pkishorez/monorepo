import { Option, Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/eschema';

export { allowsOrigin } from './origins.js';

/*
 * The Link: how an App reaches a Plugin through a Connection, which an older
 * `ke-connect` serves, so it changes only with a raised Minimum Connect
 * (ADR 0011). Which pages may knock at all is origins.ts.
 *
 * An App calls a Connection's Plugin at the Release it was built with,
 * `<tunnel>/<name>/<sha256>/rpc`, named by the Plugin's name and the sha256 of
 * its file. When the Connection runs another, its server takes the socket and
 * closes it at once with `PLUGIN_MISMATCH`, the reason saying which hash runs:
 * a browser cannot read the status of a refused WebSocket, only how it closed.
 * Which side is behind then is Connect Cloud's alone to say, as a Release
 * Standing: hashes have no order, and only it knows every Release.
 *
 * A socket offering any key but the Connection Key is closed the same way,
 * with `KEY_EXPIRED`: the Connection keeps only the one key, so it cannot tell
 * an old key from a made-up one.
 */

/**
 * The subprotocol a socket offers, and the server selects once the key checks
 * out. A browser can set no header on a WebSocket but `Sec-WebSocket-Protocol`.
 */
export const PROTOCOL = 'ke-connect';

/** What starts the subprotocol that carries the Connection Key: `key.<key>`. */
export const KEY_PREFIX = 'key.';

/** The subprotocols a socket offers to prove the Connection Key `key`. */
export const keyProtocols = (key: string): ReadonlyArray<string> => [
  PROTOCOL,
  `${KEY_PREFIX}${key}`,
];

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

/** The close code of a socket that offered a key other than the Connection Key. */
export const KEY_EXPIRED = 4401;

/** Whether a socket was closed for offering a key other than the Connection Key. */
export const keyExpired = (close: {
  readonly code: number;
  readonly reason: string;
}): boolean => close.code === KEY_EXPIRED;
