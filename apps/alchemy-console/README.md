# alchemy-console

Deploy platform for Alchemy apps: connect GitHub, deploy every push and pull request, and explore every stack in your Cloudflare accounts.

## Big picture

A signed-in, invited user connects GitHub, picks a repository folder holding
an `alchemy.run.ts`, and Console deploys it: Production on every push,
a `pr<N>` preview per pull request, destroyed when it closes. Each run executes
the project's own Alchemy, so custom resources deploy and destroy too
([ADR 0003](./docs/adr/0003-rewrite-as-a-deploy-platform.md),
[ADR 0005](./docs/adr/0005-runner-uses-the-projects-own-alchemy.md)). The
words are in [CONTEXT.md](./CONTEXT.md).

It is one Cloudflare Worker. Its pages are a Kabuki app served by Kabuki Start
(`@kestack/kabuki`); every user's data lives in their own User Space, a Durable
Object the same Worker exports, which serves that user's Console API over
hibernating WebSockets ([ADR 0004](./docs/adr/0004-each-user-owns-a-durable-object.md)).
Sign-in is the shared Auth Worker's (`@kestack/auth-toolkit`), the API is
Effect RPC (`@kestack/rpc-toolkit`), records are `@kestack/std-toolkit`
entities on the object's SQLite, and the UI is `@kestack/web-platform`.

The layout, which `laymos lint` checks, keeps client, server and runner apart:
they share only `src/shared`.

```
src/
  client/            the Kabuki app: app.tsx, document.tsx, console/ (the root gate), pages/<page>/
  server/            worker.ts (the entry), loaders.server.ts, host/ (routes), user-space/ (the Durable Object)
  shared/contracts/  what both sides speak: entities, console-api/
  shared/pages/      the route tree, read by the browser and the Loaders alike
```

## Usage

### Run it locally

`pnpm dev` runs `alchemy dev` behind portless, on a personal stage with state
on disk and Local mode sign-in: type any email, and an invited one gets in. Set
`CONSOLE_INVITES` and `CONSOLE_AUTH_URL` as `.env.example` describes, and put
the Vault key, `CONSOLE_VAULT_KEY` (32 random bytes, base64), in
`.env.vault-local`: it seals every credential a user adds. `pnpm test`
builds the Worker as a deploy does and runs it in Miniflare; `pnpm lint` runs
the checks, types and `laymos lint`.

```sh
CONSOLE_INVITES=ada@demo pnpm --filter alchemy-console dev
pnpm --filter alchemy-console test
```

- `prod`, `dev` and `pr<N>` deploy only from CI, each with its own Vault key from the repository secrets (`DEV_CONSOLE_VAULT_KEY` for `dev`, `CONSOLE_VAULT_KEY` otherwise): `main` to console.kishore.app, `console-next` to dev-console.kishore.app, each pull request to `pr<N>-console.kishore.app`.

### Add a page

A page is a definition, a build and a View. The definition goes in
`src/shared/pages/<page>/` and joins Console's `pages`; its build and View go
in `src/client/pages/<page>/` and join `ConsoleLive`'s `pages` and
`ConsoleView`; its Loader, if it has data, goes in `src/server/loaders.server.ts`.
For live data the page runs one Worker that follows a Console API stream, as
Welcome does:

```ts
workers: {
  member: {
    run: (self) =>
      Effect.gen(function* () {
        const api = yield* Api;
        yield* api
          .follow((client) => client['Session.watch']())
          .pipe(Stream.runForEach((member) => self.send({ _tag: 'MemberSeen', member })));
      }).pipe(Effect.retry(Schedule.spaced('2 seconds')), Effect.orDie),
  },
},
```

- The Worker runs while the page is on screen; leaving it stops the stream.
- `Api.follow` begins the stream again as the new member after an Account Switch, on their own socket.

### Add an RPC group, a workflow or a route

- A group is a nested module of `src/shared/contracts/console-api/`, merged in `console-api.ts`: `Auth.required(Session.merge(Credentials))`.
- A secret a workflow keeps goes through the `vault` service: storage holds only what `vault.encrypt` sealed, and a run reads a credential's keys only through `envFor` in `workflows/credentials`.
- A screen that needs a new credential holds `AddCredentialLive` (`src/client/add-credential/`) as a Child, hands it `open` and the provider it needs, and Provides an `AddCredentialOpener` to hear the new credential's ID.
- Its handlers come from a workflow, `src/server/user-space/workflows/<name>/`, spread into `handlers` in `user-space.ts`; a service it needs is `src/server/user-space/services/<name>/`, built in `services` there.
- A Worker route of its own, like `/github/*`, is a file in `src/server/host/` and a case in `host.ts`, answered before Start.
