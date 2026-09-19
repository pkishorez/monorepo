import { Schema } from 'effect';
import { pipe } from 'effect/Function';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Authz } from 'auth-toolkit/rpc';

export const Principal = Schema.Struct({
  kind: Schema.Literals(['session', 'token']),
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    name: Schema.String,
  }),
});

const Hello = Rpc.make('Hello', {
  payload: { name: Schema.optionalKey(Schema.String) },
  success: Schema.String,
});

const WhoAmI = Rpc.make('WhoAmI', { success: Principal });

export const Greeting = pipe(RpcGroup.make(Hello, WhoAmI), Authz.guard());
