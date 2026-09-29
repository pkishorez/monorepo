# One Auth Worker Contract under three program graphs

The package is four programs that talk to one Auth Worker: the Auth Worker itself with its pages, a Consumer Backend, and the First-Party browser and CLI. We organise the source as three Laymos layer graphs, one per side: `auth-worker` (database, pages, app, worker), `consumer-backend` (vanilla, then effect on top), and `clients` (browser, cli). One pure layer, `auth-worker-contract`, sits under all three. It holds everything a program may rely on without running the Auth Worker: base path, issuer, JWKS URL, what an Access Token says, and the `PagesContext` the Worker hands its pages. Before this, seven sibling layers with almost no rules each kept their own copy of those facts. There were three copies of `/api/auth` and two of `PagesContext`, and nothing stopped them drifting.

The contract has no dependencies, so the browser door never pulls in Effect or Better Auth. Each program still decodes wire data its own way, for example the CLI's Effect `Schema`. Nothing but the contract is shared between graphs, so a Consumer Backend never loads the Auth Worker's Better Auth instance or its embedded pages. The Worker and its pages app meet at build time (`scripts/bundle-app.mts`), not through an import, so no `worker → app` rule exists.

Public subpaths follow the same split: the first segment names the program that imports it (`/worker/...`, `/server/...`, `/clients/...`). `/rpc` and `/http-api` stay top-level because contract code on both sides imports them. The old `/server`, `/client`, `/cli`, `/rpc/server`, `/http-api/server`, `/database/*` and `/alchemy/d1` paths were renamed, not aliased, while the package is pre-1.0.

## Considered Options

- **One layer per job** (`contract → providers → verification → integrations → hosts`) across the whole package. Rejected: consumers think in doors (worker, server, browser, cli), and a job stack would spread each door across layers.
- **Merging `ui` into `app`.** Rejected: Laymos lets only members of the same module graph import a graph member within a layer, and TanStack treats every file in `routes/` as a route, so route files cannot carry the `index.ts` doors that graph membership needs. The pages stay their own layer beside `app`.
