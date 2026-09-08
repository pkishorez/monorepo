# Storage: DynamoDB

One STD toolkit table on DynamoDB, provisioned by Alchemy per stage and reached through `DynamoDB.make(__NAME__Table, settings)`. Pick this for data shared across Durable Objects or Workers, or for an existing AWS footprint. Each instance is one table with its own name.

Requires `application`; works with either RPC primitive. Local development uses DynamoDB Local at `http://localhost:8090`, which must already be running; the table is created on startup.

## Files

Adds:

- `src/shared/contracts/__NAME__-table/`: the empty `__NAME__Table` with a primary key and four GSIs.
- `infra/tables/__NAME__.ts`: `provision__Name__Table`, creating `__APP_NAME__-__NAME__-<stage>` on AWS for deployed stages and on DynamoDB Local otherwise.
- `infra/dynamodb.snippet.ts`: `__NAME__Settings` and `make__Name__Database`, reading table name, region, endpoint, and credentials from configuration. Copy it to `src/server/services/__NAME__/dynamodb.ts` for `rpc-worker`, or to `src/server/services/__NAME__/dynamodb.ts` beside the object for `rpc-durable-object`.

## Seams

- `alchemy.run.ts`: merge `alchemy/AWS` providers once: `Layer.mergeAll(Cloudflare.providers(), awsProviders())`.
- `infra/website.ts`: call `provision__Name__Table(stage)` and pass the returned name as `__NAME_ENV___TABLE_NAME` plus `APP_AWS_ACCESS_KEY_ID`, `APP_AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` in `env` for `rpc-worker`. For `rpc-durable-object`, pass the same entries in `env`; the object reads them from its constructor `env`. The AWS credentials are shared by every table; only the table name is per instance.
- Handlers: provide `make__Name__Database(settings).layer` where handlers are hosted, `src/server/rpc/<rpc-name>/entry.ts` or `src/server/durable-objects/<rpc-name>.ts`.
- `package.json`: add `std-toolkit: workspace:*` to dependencies.
- GitHub Actions: add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCOUNT_ID`, `AWS_REGION`, `APP_AWS_ACCESS_KEY_ID`, and `APP_AWS_SECRET_ACCESS_KEY` to both workflows once.

## Laymos

Add layer `contracts` once with paths `src/shared/contracts`. Per instance, add `src/shared/contracts/__NAME__-table` as an exposed module and `infra/tables/__NAME__.ts` to `infra` as `{ "shared": true }`. Add rule once: `infra` uses `contracts`. With `rpc-worker`, add `server-services` for `src/server/services` once, with `src/server/services/__NAME__` exposed, and let `server-rpc` use it.

## Verify

`pnpm dev` creates `__APP_NAME__-__NAME__-<stage>` on DynamoDB Local and the greeting round-trips. A deployed stage shows the table in the Alchemy state tree; production tables are retained on destroy.
