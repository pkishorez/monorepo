# rpc-worker

Declares an RPC-callable Cloudflare Worker with alchemy, and rate-limits it,
without every app touching `alchemy/Cloudflare` directly.

## Scenario

Your Worker handles requests over `alchemy`'s `RpcWorker`, and you want to
cap how often one client can call it — say 120 requests per 10 seconds per IP,
429 once they're over.

## Usage

The common case — guard a whole per-request handler and respond 429:

```ts
import {
  RpcWorker,
  withRateLimitGuard,
} from '@monorepo/alchemy-toolkit/unstable/rpc-worker';

export default class MyApi extends RpcWorker<MyApi>()(
  'MyApi',
  { schema: MyRpcs /* ...rest of the RpcWorker config */ },
  withRateLimitGuard(
    { name: 'MY_API_LIMIT', namespaceId: 1001, limit: 120, period: 10 },
    myPerRequestEffect,
  ),
) {}
```

Need the check inline in your own effect instead — e.g. to rate-limit by user
id, or to run other logic before deciding to guard at all:

```ts
import {
  RateLimit,
  checkRateLimit,
} from '@monorepo/alchemy-toolkit/unstable/rpc-worker';

Effect.gen(function* () {
  const throttle = yield* RateLimit({
    name: 'MY_API_LIMIT',
    namespaceId: 1001,
    limit: 120,
    period: 10,
  });

  return Effect.gen(function* () {
    yield* checkRateLimit(throttle, userId);
    // ...your handler
  });
});
```

`namespaceId` must be unique per independent limit, account-wide — two
bindings that share one share the same counters, even across Workers.

## Status

`unstable`. Wrapped, not yet proven — no production track record or tests of
its own as a wrapper. Do not promote to `stable` without both.

`RpcWorker` also confines a workaround for an alchemy bug (a Node terminal
service crash inside Cloudflare Workers), applied workspace-wide via
`patches/alchemy@2.0.0-beta.72.patch` in `pnpm-workspace.yaml`. TODO: drop the
patch once [alchemy-run/alchemy#1127](https://github.com/alchemy-run/alchemy/pull/1127)
merges and ships in a release.
