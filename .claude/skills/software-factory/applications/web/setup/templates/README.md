# Setup templates

Apply common files, then the selected backend overlay, then the selected storage overlay. Replace placeholders and reuse the supplied wiring and Laymos configuration. Inspect installed APIs only where a selected adapter or a reported error requires it.

Framework-generated route files are intentionally absent; follow the [local review checkpoint](../guide.md#3-checkpoint-local-review).

## 1. Common files

Start with [common/package.json](common/package.json), [Alchemy](common/alchemy.run.ts), and the remaining files in `common/`.

Fill in app name, title, stack name, production hostname, local hostname, and Portless name from the agreed settings.

Use [root scripts](monorepo/scripts.json), [Vite configuration](monorepo/vite.config.ts), and [Syncpack configuration](monorepo/.syncpackrc.json) only for missing root configuration.

Remove the Alchemy template’s CI-only deployment guard when GitHub Actions is declined and manual deployment is requested.

## 2. Backend

For a normal Worker, apply [worker](worker/README.md): HTTP RPC and polling for future updates.

For a Durable Object, apply [durable-object](durable-object/README.md): hibernating WebSocket RPC.

These are the factory's transport defaults; reuse the selected transport for future methods. Both backend overlays define the RPC runtime before connecting React through `use-effect-ts`. Keep transport ownership in that runtime so completing a request does not close the connection.

For client-only apps, keep the greeting page, omit backend RPC, and adapt hosting and dependencies to client-only operation.

## 3. Storage

Apply [storage](storage/README.md) for the selected database, independently of transport.

## 4. GitHub Actions

When selected, fill in [github-actions](github-actions/README.md) and its workflow examples.

Return to the [local review checkpoint](../guide.md#3-checkpoint-local-review) after generating all files.
