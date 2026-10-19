import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import {
  CredentialError,
  CredentialSummary,
  NewCredential,
} from '../../credential/index.ts';

/**
 * The caller's Provider credentials. `list` answers at once and again on
 * every change, in every tab; `add` verifies the keys with the provider
 * before keeping them. No call ever answers with a secret.
 */
export const Credentials = RpcGroup.make(
  Rpc.make('list', { success: Schema.Array(CredentialSummary), stream: true }),
  Rpc.make('add', {
    payload: NewCredential,
    success: CredentialSummary,
    error: CredentialError,
  }),
  Rpc.make('rename', {
    payload: { credentialId: Schema.String, name: Schema.String },
    success: CredentialSummary,
    error: CredentialError,
  }),
  Rpc.make('remove', {
    payload: { credentialId: Schema.String },
    error: CredentialError,
  }),
).prefix('Credentials.');
