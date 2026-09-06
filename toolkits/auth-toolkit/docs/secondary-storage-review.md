# Secondary storage review

Research date: 2026-09-06. Decision: use only the Primary Database; see [ADR 0005](./adr/0005-auth-state-uses-only-the-primary-database.md). Findings below describe the implementation before secondary storage was removed. The Cookie Cache policy is unchanged.

## Findings

The workspace pins Better Auth 1.7.2. Its [1.7 storage contract](https://better-auth.com/docs/guides/1-7-upgrade-guide) requires atomic `increment(key, ttl)` and `getAndDelete(key)` operations. Increment must preserve the original counter expiry within its lifetime.

The former KV provider throws for increment and implements get-and-delete as two separate requests. Concurrent callers can therefore receive the same value. It satisfies the TypeScript shape without providing the required behavior.

The pre-removal auth model disables Better Auth rate limiting, stores verification records in the primary database, and persists sessions there too. These choices avoid the main counter and verification-consumption paths through KV today; this is not evidence that the provider supports the full contract. Installed Better Auth session lookup returns a secondary-storage hit directly and falls back to the database on a miss when database session persistence is enabled. Database persistence therefore does not validate a stale KV hit.

[Cloudflare KV](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) permits one write per second per key, requires expiration TTLs of at least 60 seconds, and does not provide atomic read-modify-write operations. Our provider forwards TTLs without handling that minimum. [KV reads](https://developers.cloudflare.com/kv/api/read-key-value-pairs/) can return stale data across locations. This makes stale session acceptance after revocation a concern, independently of the missing increment operation.

Cookie caching is separately enabled for 300 seconds by default. [Better Auth documents](https://better-auth.com/docs/concepts/session-management) that other devices can continue using revoked sessions until their cookie cache expires. Replacing KV alone does not provide immediate revocation.

Installed Better Auth also maintains each user's cached session index through separate read and write calls. Its bulk session deletion uses that index to choose which cached tokens to remove. An incomplete index could leave cached sessions after database deletion; this is a source-based risk, not a reproduced exploit. A stronger backend alone does not make that multi-call workflow atomic. Verification records are still mirrored into secondary storage even though the current configuration consumes them through the database.

## Alternatives

- **Redis:** Better Auth [recommends its official Redis storage package](https://better-auth.com/docs/concepts/database). This is the standard integration direction when secondary storage is needed. Validate Worker transport compatibility and the chosen service's read consistency. Upstash offers an [HTTP client for edge runtimes](https://upstash.com/docs/redis/overall/getstarted), but its [documented eventual consistency](https://upstash.com/docs/redis/features/consistency) means it should not automatically be treated as a solution for immediate cross-client revocation.
- **Cloudflare Durable Objects:** A reasonable Cloudflare-native replacement. Their [transactional, strongly consistent storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/) can implement the contract. Requires a custom provider, explicit logical expiry, and deliberate key routing. Storage guarantees alone do not make multi-call application workflows atomic.
- **DynamoDB:** Viable with a custom provider. Use [strongly consistent table reads](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html), atomic updates for counters, and [DeleteItem with ALL_OLD](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_DeleteItem.html) for consumption. [TTL deletion can lag by days](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html); enforce expiry during reads, consumption, and expired-counter reset. Counter reset needs concurrency-safe conditions, not just an unconditional increment. Adds AWS provisioning, credentials, and cross-cloud requests.
- **No secondary storage:** Keep sessions and verification in D1, and select a suitable rate-limit strategy. This removes a provider and is worth evaluating before assuming a separate store is necessary. Our worker currently requires secondary storage, so this option needs a small API change and validation of the installed database adapter's relevant operations.

## Recommendation and open decisions

The user clarified that minimizing cost is the main reason for secondary storage. Given that constraint, recommend evaluating D1 without secondary storage first. The current implementation already persists sessions in D1; secondary storage adds duplicate writes. The session token has a unique index, and user lookup uses its primary key, so ordinary session verification need not scan all sessions. Actual billable rows require measurement.

Do not retain raw Cloudflare KV as the general secondary-storage provider. Redis remains the standard integration when secondary storage is justified; Durable Objects are a Cloudflare-native alternative. Neither is automatically cheaper than using the existing primary database.

## Cost and infrastructure follow-up

Published USD prices checked 2026-09-06; these are billing units, not prices per sign-in or session verification. Storage, compute, replication, and included allowances affect the total.

| Service                                                                                       | Included allowance and operation pricing                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [D1](https://developers.cloudflare.com/d1/platform/pricing/)                                  | Free: 5M rows read and 100K written daily. Paid: 25B reads and 50M writes monthly; excess $0.001/M rows read and $1/M rows written. Index changes can add writes.           |
| [Workers KV](https://developers.cloudflare.com/kv/platform/pricing/)                          | Paid: 10M reads and 1M writes monthly; excess $0.50/M reads and $5/M writes. Deletes have a separate 1M allowance and $5/M overage.                                         |
| [Upstash Redis](https://upstash.com/pricing/redis)                                            | Free: 500K commands monthly, 256 MB. Pay-as-you-go: $2/M commands; the free command allowance does not carry into paid plans. Read-region replication adds billed commands. |
| [SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) | Paid: 1M requests monthly, then $0.15/M, plus duration and storage operations. SQLite row-operation allowances and rates match D1.                                          |

The [Workers paid plan](https://developers.cloudflare.com/workers/platform/pricing/) starts at $5 per account per month. It is shared platform spend, not a separate $5 fee per database.

Cloudflare lists Redis through [external database integrations](https://developers.cloudflare.com/workers/databases/connecting-to-databases/), not a native managed Redis service. [Upstash has Terraform support](https://upstash.com/docs/devops/terraform/overview). Installed Alchemy 2.0.0-beta.76 exposes `Fly.Redis` (Fly's Upstash add-on), `Railway.Redis` (a Redis service), AWS ElastiCache ServerlessCache, and AWS MemoryDB Cluster. No standalone Upstash provisioner was found in that version; `alchemy/Redis` is a runtime client, not a resource. Runtime compatibility and network reachability still need validation for a selected deployment.

[Redis Cloud](https://redis.io/pricing/) offers Essentials starting at $5/month; [Railway Hobby](https://railway.com/pricing) starts at $5/month including $5 usage, with resource usage determining any excess. These are additional service costs to compare against D1's included allowance.

DynamoDB latency is not established as excessive. Cross-cloud round trips depend on Worker placement, AWS region, connection setup, and sequential calls. External Redis has a similar geographic consideration; D1 and Durable Objects also route requests to storage locations. Benchmark representative end-to-end session checks before choosing a provider for latency.

The user selected primary-only persistence to minimize cost and defer additional infrastructure until measurements justify it. The implementation removes secondary storage from the worker API, package exports, and deployment examples. Existing primary database records and migrations are retained.

The glossary now describes the Primary Database as the owner of all persisted auth state; the separate Session Store term has been removed.
