# RPC integration consolidation

Agreed design from the grill-with-docs session, implemented by the package migration. The checklist below records its scope and verification requirements.

## Public structure

```text
rpc-toolkit/
  rpc/
    cannotation/
    invocation/
    websocket-client/
    cloudflare/
      hibernating-rpc/
      alchemy/
        rpc-worker/
        durable-rpc-worker/
  http/
    cannotation/

std-toolkit/
  db/
    dynamodb/
      alchemy/
```

Each leaf is an explicit package subpath. Preserve existing Cannotation entry points. Keep Alchemy an optional peer of both destination packages, and keep Cloudflare and Alchemy imports outside browser and contract entry points.

The WebSocket client owns transport construction, connection status, and subscription restart. Hibernating RPC owns socket attachments, checkpoints, wake replay, and its existing Alchemy-independent platform ports. DurableRpcWorker composes that runtime with Alchemy resources and routing; RpcWorker retains its upstream Alchemy re-export. DynamoDB's Alchemy module translates the existing table topology into a resource.

## Dependency boundaries

- HTTP and RPC remain independent siblings.
- `rpc/invocation` is a platform-independent leaf consumed by the hibernating runtime and middleware implementations that need invocation kind.
- The WebSocket client has no Cloudflare or Alchemy dependency.
- The hibernating runtime has no Alchemy dependency.
- Alchemy deployment modules may depend on runtime modules; runtime modules never depend on deployment modules.
- DynamoDB resource provisioning consumes table topology; the ordinary DynamoDB entry point does not import or re-export Alchemy provisioning.

Update Laymos rules to enforce these directions using disjoint layer paths. Folder nesting alone must not give platform-independent modules permission to import deployment code.

## Invocation behavior

| Event                                | Invocation kind | Server Cannotation | Client Cannotation         | Admission accounting      |
| ------------------------------------ | --------------- | ------------------ | -------------------------- | ------------------------- |
| Initial call                         | `fresh`         | Runs               | Runs when configured       | Counts                    |
| Hibernation Replay                   | `replay`        | Runs again         | Does not run               | Does not count by default |
| Subscription Restart after reconnect | `fresh`         | Runs               | Runs again when configured | Counts                    |

Expose invocation kind through an Effect context reference defaulting to `fresh`; only restoration dispatch supplies `replay`. No Cannotation signature change or Cloudflare import is required for consumers of the signal. Middleware implementations use it for admission accounting; the signal does not automatically change arbitrary middleware behavior.

Authorization implementations check current permission on fresh dispatch and replay. Stored connection identity and original request headers are not proof of current permission. A denial terminates the call with its declared error. Continuous revocation during an uninterrupted stream remains application policy.

Keep native Effect composition for the protocol, client, and Cannotation layers. Provide one complete example instead of introducing a client/server assembly factory.

## Migration and verification

1. Add the destination modules and explicit exports, retaining the existing public operations and deployment resource identities. Configure optional peers, build output, and Laymos boundaries.
2. Add invocation kind and supply it on restoration dispatch. Prove context propagation through the installed Effect server with integration tests.
3. Move DynamoDB resource provisioning, correcting the omitted local secondary indexes and testing preservation of the declared topology.
4. Update workspace imports, manifests, documentation, examples, and lockfile. Preserve Worker IDs, Durable Object class names, instance routing, transfer settings, and the independent workspace Alchemy patch.
5. Verify initial middleware execution, replay authorization denial, replay admission accounting, checkpoint restoration, fresh credentials on reconnect, declared errors, and cancellation cleanup. A server-observed cancellation must prevent later replay; a cancelled client subscription must not restart on reconnect.
6. Verify browser and shared-contract entry points do not transitively import Cloudflare or Alchemy. Run affected package typechecks, builds, tests, and architecture checks.
7. Remove the two retired private packages and their unused generic HTTP rate-limit helpers in the same migration, with no compatibility exports. Check for stale imports and rerun affected checks against the final state.

## Decisions

- [RPC ownership and package retirement](adr/0003-rpc-owns-runtime-and-deployment-integrations.md)
- [Replay authorization and admission accounting](adr/0004-replay-rechecks-authorization-without-readmission.md)
- [DynamoDB resource ownership](../../../std-toolkit/docs/adr/0010-dynamodb-owns-alchemy-resource-provisioning.md)
