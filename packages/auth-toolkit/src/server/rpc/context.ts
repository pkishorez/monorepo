import { Context, Effect, Schema } from 'effect';

import type { CurrentAuthValue } from '../current-auth.js';

export type { CurrentAuthValue } from '../current-auth.js';

export class CurrentAuth extends Context.Service<
  CurrentAuth,
  CurrentAuthValue
>()('auth-toolkit/server/rpc/CurrentAuth') {}

export class Unauthenticated extends Schema.Error<Unauthenticated>(
  'auth-toolkit/server/rpc/Unauthenticated',
)({
  _tag: Schema.tag('Unauthenticated'),
  reason: Schema.String,
}) {}

export class Forbidden extends Schema.Error<Forbidden>(
  'auth-toolkit/server/rpc/Forbidden',
)({
  _tag: Schema.tag('Forbidden'),
  reason: Schema.String,
}) {}

export type AuthPolicy = (
  auth: CurrentAuthValue,
) => Effect.Effect<void, Forbidden>;

// Internal: the policy withAuthz annotates onto an Rpc/RpcGroup.
export class AuthorizationPolicy extends Context.Service<
  AuthorizationPolicy,
  AuthPolicy
>()('auth-toolkit/server/rpc/AuthorizationPolicy') {}
