import { Schema } from 'effect';
import { Rpc, RpcGroup, RpcSerialization } from 'effect/rpc';
import type { RpcClient, RpcClientError } from 'effect/rpc';
import { KabukiSessionRpcs } from '../session/contract/index.ts';

export const CONNECT_PATH = '/kabuki/connect';

export const SESSIONS_PATH = '/kabuki/sessions';

export const SESSION_PATH = '/kabuki/session/:name';

export const sessionPath = (name: string) =>
  `/kabuki/session/${encodeURIComponent(name)}`;

export const serialization = RpcSerialization.layerJson;

export const TabRpcs = RpcGroup.make(
  Rpc.make('named', { payload: { name: Schema.String } }),
  Rpc.make('page', { success: Schema.String, stream: true }),
);

export const ServedRpcs = KabukiSessionRpcs.merge(TabRpcs);

export type TabClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof ServedRpcs>,
  RpcClientError.RpcClientError
>;
