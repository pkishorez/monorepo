# Application

The skeleton every PSF web application starts from: a TanStack Start site served by a Cloudflare Worker, deployed with Alchemy, styled with kui-toolkit, checked by Laymos. Always applied first; other primitives compose onto it.

## Layout

```text
<app>/
  alchemy.run.ts          # Stack: composes infra resources
  infra/                  # deployable resources, one file each
    stage.ts              # production host, stage guards, Portless port
    website.ts            # the TanStack Start Worker
    durable-objects/      # one <name>.ts per Durable Object Worker (rpc-durable-object)
    tables/               # one <name>.ts per DynamoDB table (storage-dynamodb)
  src/
    router.tsx            # web entry
    server.ts             # server entry
    styles.css            # KUI + Tailwind
    routes/               # page.tsx per route folder; components/ and internal/ are not routes
    shared/domain/        # pure business rules (greeting is the sample)
    shared/contracts/     # <name>-table/ per STD table (added by storage primitives)
    shared/rpc/           # <group>/ and <group>-handlers/ per RPC group (added by rpc primitives)
    client/rpc/           # <name>/ per RPC instance: runtime and client (added by rpc primitives)
    server/rpc/           # <name>/ per worker RPC instance: HTTP host (added by rpc-worker)
    server/services/      # <name>/ per server-only service (added by storage-dynamodb)
  laymos.config.json      # sourceRoots: src and infra
```

## Placeholders

| Placeholder           | Example                  | Where                             |
| --------------------- | ------------------------ | --------------------------------- |
| `__APP_NAME__`        | `hello`                  | package.json, Laymos descriptions |
| `__APP_TITLE__`       | `Hello`                  | root route title, home page       |
| `__STACK_NAME__`      | `Hello`                  | alchemy.run.ts                    |
| `__PRODUCTION_HOST__` | `hello.kishore.app`      | infra/stage.ts                    |
| `__LOCAL_HOST__`      | `hello.kishore.computer` | vite.config.ts                    |
| `__PORTLESS_NAME__`   | `hello.kishore`          | portless.json                     |

Derive the local host by replacing the production host's last label with `computer`. The Portless name is the production host without its last label.

## Seams other primitives edit

- `alchemy.run.ts`: the Stack's resource list.
- `infra/website.ts`: the Website effect, for `env` values and resources it depends on.
- `src/routes/__root.tsx`: the provider slot around `{children}`; one provider per RPC instance, nested.
- `src/routes/page.tsx`: replaced by rpc primitives with a page that proves the connection.
- `src/server.ts`: replaced by rpc-worker; routes `/rpc/<name>` per instance.
- `laymos.config.json`: layers and layer graph rules.
- `package.json`: dependencies.

## Composing hosts

All server-side hosts (HTTP RPC, Durable Objects, webhooks) live in the one Website Worker and compose in `src/server.ts`. One origin, no `VITE_*_URL`.

- Each instance owns a pathname and adds one `case`: `/rpc/__NAME__` for HTTP RPC, `/ws/__NAME__` for a Durable Object WebSocket. `default` is TanStack Start.
- Bindings go under `env` in `infra/website.ts`; Alchemy has no `bindings` prop. A hosted Durable Object is `Cloudflare.DurableObject('__Name__Object')` with no script name, and its class is re-exported from `src/server.ts`.
- `WorkerEnv` is a type-only import from `infra/website.ts`. `infra` never imports from `src`, or Laymos reports a cycle; leave the namespace untyped there.
- Instances never share files: `src/client/rpc/__NAME__`, `src/routes/internal/__NAME__-rpc-provider.tsx`, one `<Greeting>` each on the page. Definitions and handlers in `src/shared/rpc` are shared.

## Laymos

Layers: `infra`, `web-entry`, `server-entry`, `routes`, `domain`. Rules: `web-entry` uses `routes`; `server-entry` uses `infra` (for `WorkerEnv`); `routes` uses `domain`. Primitives add their layers and rules as listed in their READMEs. `src/routeTree.gen.ts` stays ignored.

With hosts composed, `server-entry` also uses `server-rpc`; `server-rpc` uses `infra`, `shared-rpc-handlers`, `shared-rpc-definitions`, `contracts`.

Laymos rejects nested layer scopes and sibling imports inside a layer: a module imported by another module of the same layer is marked `"shared": true` (as `infra/stage.ts` is), and a module imported from another layer is `"exposed": true`. Route pages are listed one file per exposed module (`src/routes/page.tsx`), never the `src/routes` folder, which would overlap the shared providers in `src/routes/internal`.

## Verify

`pnpm lint` passes once `pnpm dev` has generated `src/routeTree.gen.ts`. `pnpm test` runs the greeting test. The home page renders the title in Inter with theme colors and a styled KUI button.
