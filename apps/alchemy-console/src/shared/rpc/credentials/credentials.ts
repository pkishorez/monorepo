import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  createCredentialInput,
  updateCredentialInput,
  credentialView,
  CredentialError,
} from '../../contracts/credentials/index.ts';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0),
);

export const Credentials = RpcGroup.make(
  Rpc.make('Credentials.Create', {
    payload: createCredentialInput,
    success: credentialView,
    error: CredentialError,
  }),
  Rpc.make('Credentials.List', {
    payload: {},
    success: Schema.Array(credentialView),
    error: CredentialError,
  }),
  Rpc.make('Credentials.Update', {
    payload: updateCredentialInput,
    success: credentialView,
    error: CredentialError,
  }),
  Rpc.make('Credentials.Delete', {
    payload: { id: nonEmpty },
    success: Schema.Void,
    error: CredentialError,
  }),
);
