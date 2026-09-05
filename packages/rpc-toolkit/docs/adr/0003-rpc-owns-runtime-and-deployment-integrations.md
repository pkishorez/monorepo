# RPC owns its runtime and deployment integrations

RPC Toolkit owns the WebSocket client at `rpc/websocket-client`, the Alchemy-independent Cloudflare runtime at `rpc/cloudflare/hibernating-rpc`, and deployment composition at `rpc/cloudflare/alchemy/rpc-worker` and `rpc/cloudflare/alchemy/durable-rpc-worker`. These are explicit package subpaths: deployment modules depend on runtime capabilities, while Cannotation and browser imports remain independent of Cloudflare and Alchemy; Alchemy is an optional peer dependency. RPC and HTTP remain independent siblings under ADR 0002, and Cannotation continues to compose through native Effect middleware.

Retire the private Effect Cloudflare and Alchemy Toolkit packages in one migration after updating their workspace consumers, without compatibility exports. DynamoDB resource provisioning moves to STD Toolkit's `db/dynamodb/alchemy`; provider-wide packages were rejected because they separate integrations from the capabilities they serve.

The migration includes integration coverage for Cannotation on initial calls, Hibernation Replay, Subscription Restart, and cancellation. Keep the existing protocol, client, and Cannotation composition APIs, with a complete example rather than a new assembly factory. Remove the unused generic HTTP rate-limit helpers currently bundled with `rpc-worker`; retain the requested `RpcWorker` entry point.

Preserve deployed resource identities and the independent workspace Alchemy patch when moving code. Correct the DynamoDB resource helper's omission of local secondary indexes and verify that the resource receives the declared topology.
