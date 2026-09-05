import * as Context from 'effect/Context';

/** Server-controlled call origin. Clients cannot select replay through request data. */
export const InvocationKind = Context.Reference<'fresh' | 'replay'>(
  'rpc-toolkit/InvocationKind',
  { defaultValue: () => 'fresh' },
);
