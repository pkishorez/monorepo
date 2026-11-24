import { Context } from 'effect';
import type { RpcClient, RpcClientError } from 'effect/rpc';

import type { MonoverseRpc } from '../../../server/rpc/contract/index.js';

/*
 * The typed client of the Monoverse server's /rpc/monoverse, as the
 * Monoverse Actors that ask the server directly Require it. Tests Provide
 * their own.
 */

export type MonoverseClientService = RpcClient.FromGroup<
  typeof MonoverseRpc,
  RpcClientError.RpcClientError
>;

export class MonoverseClient extends Context.Service<
  MonoverseClient,
  MonoverseClientService
>()('Monoverse/service/MonoverseClient') {}
