import { Option, Schema } from 'effect';
import { PluginHash } from '@kestack/connect-cloud/heartbeat';
import { ESchema } from '@kestack/std-toolkit/eschema';

export const HEALTH = '/health';

export const PROTOCOL = 'ke-connect';

export const KEY_PREFIX = 'key.';

export const KEY_HEADER = 'ke-connect-key';

export const keyProtocols = (key: string): ReadonlyArray<string> => [
  PROTOCOL,
  `${KEY_PREFIX}${key}`,
];

export interface PluginAt {
  readonly name: string;
  readonly hash: string;
}

const PATH = /^\/([a-z0-9][a-z0-9-]{0,62})\/([a-f0-9]{64})\/rpc\/?$/;

export const pluginPath = (name: string, hash: string) =>
  `/${name}/${hash}/rpc`;

export const pluginOfPath = (path: string): PluginAt | null => {
  const found = PATH.exec(path);
  return found === null ? null : { name: found[1]!, hash: found[2]! };
};

export const KEY_EXPIRED = 4401;

export const PLUGIN_MISMATCH = 4409;

export const PluginMismatch = ESchema.make('PluginMismatch', {
  running: Schema.NullOr(PluginHash),
}).build();
export type PluginMismatch = typeof PluginMismatch.Type;

const MismatchJson = Schema.fromJsonString(PluginMismatch.schema);

export const mismatchReason = (running: string | null): string =>
  Schema.encodeSync(MismatchJson)({ running });

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

export const keyExpired = (close: { readonly code: number }) =>
  close.code === KEY_EXPIRED;
