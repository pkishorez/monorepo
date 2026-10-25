# Spec: connect

Source: ADR 0011 (`docs/adr/0011-ai-toolkit-stops-at-the-harness-connect-owns-the-rest.md`) and the planning conversation on `feat/connect`.

The decisions are made. This spec says where every file goes, in what order, and how to check each step. Use the words of `apps/connect/CONTEXT.md`, `toolkits/ai-toolkit/CONTEXT.md`, `apps/code/CONTEXT.md` and the root `CONTEXT.md` exactly.

## Outcome

- `@kestack/ai-toolkit` runs Coding Harnesses and nothing more. It keeps nothing and serves nothing: no `bin`, no RPC, no storage, no Machine.
- `@kestack/connect` (`apps/connect`, command `ke-connect`, published, in the stack's version group) owns the Machine, Cloud Connect (Worker + D1 at `connect.kishore.app`) and the `code` App Group.
- `apps/code` is a UI only. It imports `@kestack/connect/code` and nothing from ai-toolkit, and no longer deploys a Worker of its own besides the site.
- Files live in XDG folders under `kestack/`. In development each branch has its own folders, Machine and Cloud Connect.
- `pnpm dev` in any App makes sure its branch's Connect is running, and Connect stops when the last App using it stops.
- Local auth (`dev:local`, `AUTH=local`, `--as`, the Worker's `AUTH_LOCAL`) is gone from Connect and Code. auth-toolkit's own Local mode stays as it is.

## Ground rules for implementers

1. **Moves are `git mv`**, then edited, so history follows the file.
2. **Persisted names never change**, so stored data still reads after the move:
   - Entity names `AiRaw`, `AiMessage`, `AiProject`, `AiSession`, `AiHarnessConfig`.
   - The std table name in `table.ts`.
   - `machinesTable` and its snapshot.
   - The legacy machine table `ai-toolkit-machine` (read once, see Paths).
   - The Raw source `'engine'` and the Raw kinds `turn.started`, `turn.ended` and `error`.
   - `PROJECTION_VERSION`, and the Replica name `replicaName(PROJECTION_VERSION)`.
   - The field name `sessionId` on Raw and Message.
3. **Context service keys follow their package.** A moved file's `'@kestack/ai-toolkit/X'` key becomes `'@kestack/connect/X'`.
4. **Renames**, applied in the phase that moves the symbol:

| Old                                 | New                                                  | Phase |
| ----------------------------------- | ---------------------------------------------------- | ----- |
| `MachinesApi`                       | `CloudApi`                                           | P2    |
| `MachinesClient`                    | `CloudClient`                                        | P2    |
| Machines Backend (prose)            | Cloud Connect                                        | P2    |
| `AiApi`                             | `CodeApi`                                            | P3    |
| `AiApiLive`                         | `CodeApiLive`                                        | P3    |
| `AiClient`, `AiClients`             | `CodeClient`, `CodeClients`                          | P3    |
| `Ai` (Replica), `AiLive`, `AiBuild` | `CodeReplica`, `CodeReplicaLive`, `CodeReplicaBuild` | P3    |
| WebSocket subprotocol `ai-toolkit`  | `ke-connect`                                         | P3    |
| `HarnessSession`                    | `LiveConversation`                                   | P4    |
| `OpenConfig`                        | `ConversationConfig`                                 | P4    |
| `Titler`, `codexTitler`             | `OneShotPrompt`, `codexOneShot`                      | P4    |
| `EngineRaw` (minus `stamp`)         | `ConversationRaw`                                    | P4    |
| `projectEngineRaw`                  | folded into `projectRaw`                             | P4    |
| claude `sdk-session/`               | claude `live-conversation/`                          | P4    |
| codex `titler/`                     | codex `one-shot/`                                    | P4    |

The subprotocol rename is safe: Machines that still run `ai-toolkit serve` are never listed by the fresh Cloud Connect. 5. **Strings in messages follow suit.** Replace `ai-toolkit serve`, `ai-toolkit logout` and `--db` in user-facing text with `ke-connect serve`, `ke-connect logout` and `--branch`. The `app` that auth-toolkit's `device()` signs in as becomes `'ke-connect'`. 6. **Kabuki shape** follows kabuki ADR 0042, as ai-toolkit's engine already does:

- An Actor is a folder named `actor-<name>`, holding `actor.ts`, and `commands.ts` only if it has Commands.
- `capabilities/` holds keys only. `services/` holds what backs them.
- A new Actor is written as a Definition and a Build side by side in `actor.ts`, as `apps/code` does (`Conversation` and `ConversationLive`). A moved Actor keeps the inline `Actor.build(Actor.define(…))` form unless the phase rewrites it.
- Each tree keeps a `docs/kabuki-tree.md`.

7. **Deep modules** follow `devtools/laymos/skills/deep-module/SKILL.md`: `index.ts` re-exports only from `<name>.ts`.
   - A package door that gathers several modules is a door module of its own, under `src/doors/<door>/` in connect, or the door's top folder in ai-toolkit.
   - A door that is exactly one module points `exports` straight at that module's `index`, as ai-toolkit does today.
8. **Laymos.** After each move run `pnpm exec laymos lint` in the package. It names every missing rule. The rule sets below are the target; add any interim rule lint asks for, as narrow as the need.

## Final shape

### `toolkits/ai-toolkit` (after P4)

```
toolkits/ai-toolkit/
  package.json  README.md  CONTEXT.md  CHANGELOG.md  LICENSE
  laymos.config.json  tsconfig.json  tsconfig.build.json  tsconfig.types.json
  docs/kabuki-tree.md            rewritten: the conversation tree and the speech tree
  docs/turn-flow.md  docs/v1-spec.md
  docs/adr/                      0004, 0014, 0015, 0016, 0018 marked "Moved to apps/connect/docs/adr/…"
  src/
    contract/                    door ./contract: any side, browser-safe
      index.ts  contract.ts
      raw/         index.ts json.ts raw.ts                    ← services/records/raw
      projection/  index.ts message.ts                         ← services/records/projection
      wire/        index.ts harness-wire.ts (+ ModelInfo)      ← services/harness/wire (+ ModelInfo from api/contract/harnesses.ts)
    harness/                     door ./harness: Node, whoever runs Coding Harnesses
      index.ts  harness.ts       re-exports, plus harnesses(list): Layer<Harnesses> and projectRaw(list)(raw)
      contract/    index.ts harness.ts chunker/                 ← services/harness/contract
      claude/      …                                            ← services/harness/claude (sdk-session/ → live-conversation/)
      codex/       …                                            ← services/harness/codex (titler/ → one-shot/)
      binaries/    index.ts binaries.ts executable.ts binaries.test.ts
      models/      index.ts models.ts models.test.ts            ← api/live/models
      conversation/
        index.ts  conversation.ts   Conversation, agents, ConversationRaw, Prompt, toTurnInput, isImage
        prompt.ts                    Prompt, toTurnInput, isImage, sizeOf
        raw.ts                       ConversationRaw
        conversation.test.ts
        capabilities/  index.ts keeper.ts agents.ts
        actor-conversation/
          index.ts actor.ts commands.ts turn.ts report.ts
          services/  index.ts agent.ts agents.ts
      fake/        index.ts fake-harness.ts fake-one-shot.ts    door ./harness/fake ← services/harness/fake
    speech/                      door ./speech: Node, Speech to Text only
      index.ts speech.ts speech.test.ts                         ← kabuki/speech/*
      actor-speech-model/  capabilities/                        ← kabuki/speech/*
      contract/  sherpa/                                        ← services/speech/{contract,sherpa}
      fake/                                                     door ./speech/fake ← services/speech/fake
```

The `speech/` tree imports nothing from `harness/` or `contract/`, and they import nothing from it.

#### The live Conversation actor (ai-toolkit `src/harness/conversation/`)

This is the Turn rules of today's Session actor, with no storage and no Session.

- **Definition** `Conversation`, **Build** `ConversationLive`.
- **Requires**: `Agents`, `ConversationKeeper`, `Harnesses`, `HarnessBinaries`.
- **Input**:

  ```ts
  {
    id: string; // key in Agents; the keeper's id for it, e.g. a Session id
    harness: HarnessName;
    cwd: string;
    model: string;
    settings: Record<string, string>;
    nativeId: string | null;
    ended: 'cancelled' | 'failed' | 'interrupted' | null;
    first: Prompt | null;
  }
  ```

- **Model**: `id, harness, cwd, model, settings, nativeId, jobs, refusedStops, activeAt, endedAt, sentAt`. The last three are numbers or null.
- **States**: `Idle { ended }` and `Running { turnId, prompt, steers, cancelling, queued }`. Both are exactly today's.
- **Messages**: `Send { prompt, at }`, `Cancel`, `TurnEnded`, `NativeId`, `Steered`, `AgentTurn`, `Jobs`, `StopJob`, `JobStopFailed`.
  - Updates are today's, minus Settle, Unsettle and Titled.
  - `Send` also sets `sentAt`, and chooses model and settings as `choose` does today.
  - A Turn starting sets `activeAt`. `TurnEnded` sets `endedAt`.
- **Workers**:
  - `agent`, always: today's desk Worker, reduced to opening the agent on first use (`services/agent.ts`, today's `makeAgent`) and putting it in `Agents` under `id`.
  - `jobs`, always.
  - `agentTurn`, in Idle.
  - `turn`, in Running, one per turnId: today's `turn.ts`. Where it called `store.appendRaw(EngineRaw.stamp(…))` it now calls `keeper.keep({ turnId, source, out })`.
  - `cancel`, while cancelling.
  - `report`, always, new: follows `self.changes`, maps each change to a `ConversationStanding`, drops repeats, and calls `keeper.stands(standing)`.
- **Queries**: `mcpStatus` and `contextUsage`. Both answer `AgentClosed` while the agent is closed.
- **Command**: `StopJob`, which is today's `commands.ts` reading the agent from `Agents`.
- **`capabilities/keeper.ts`** declares `ConversationKeeper`, which the parent Provides:

  ```ts
  class ConversationKeeper extends Context.Service<
    ConversationKeeper,
    {
      /** Keeps one record, in order: the harness's, or the Conversation's own turn.started / turn.ended / error. */
      readonly keep: (record: {
        readonly turnId: string;
        readonly source: RawSource;
        readonly out: RawOut;
      }) => Effect.Effect<void>;
      /** A Request: how the Conversation stands now; sent on every change. */
      readonly stands: (standing: ConversationStanding) => Effect.Effect<void>;
    }
  >()('@kestack/ai-toolkit/ConversationKeeper') {}

  interface ConversationStanding {
    readonly status:
      | 'idle'
      | 'running'
      | 'cancelled'
      | 'failed'
      | 'interrupted';
    readonly turnId: string | null; // the running Turn
    readonly nativeId: string | null;
    readonly model: string;
    readonly settings: Readonly<Record<string, string>>;
    readonly activeAt: number | null; // when the latest Turn started
    readonly endedAt: number | null; // when the latest Turn ended
    readonly sentAt: number | null; // when the user last sent a message
  }
  ```

- **`capabilities/agents.ts`** declares `Agents`, a registry by `id`.
  - It replaces the agent half of today's Desk: `agent`, `opened`, `reset`, `jobs`, `nextAgentTurn` and `takeAgentTurn`.
  - `services/agents.ts` implements it, adapted from today's `services/desks.ts`.
  - The door exports the Layer as `Conversation.agents`. Whoever starts the Runtime adds it.
- **The door object**: `Conversation = { actor: ConversationLive, agents }`.
- **Also exported**: `ConversationKeeper`, `ConversationStanding` (type), `Prompt`, `toTurnInput`, `isImage`, `AgentClosed` and `ConversationRaw`.
  - `ConversationRaw` holds `turnStarted`, `turnEnded`, `failure`, `startedOf`, `endedOf`, `project` and `Attachment`. It does not hold `stamp`.
- **`OneShotPrompt`** lives in `harness/contract/harness.ts`:

  ```ts
  class OneShotPrompt extends Context.Service<
    OneShotPrompt,
    {
      /** The reply to `text` from a Coding Harness with no Conversation behind it: read-only, no tools, nothing kept. */
      readonly prompt: (text: string) => Effect.Effect<string, HarnessError>;
    }
  >()('@kestack/ai-toolkit/OneShotPrompt') {}
  ```

  `codex/one-shot/one-shot.ts` is today's `titler.ts` with the title-specific parts moved out to Connect (`prompt()`, `clean`, `MAX_WORDS`, `MESSAGE_CHARS`). What stays: the temp folder, the small model chosen by `titleModel` (renamed `smallModel`), the read-only ephemeral thread, and a 30 s timeout. It returns the last `agentMessage` text, trimmed.

- **Harness Binaries** in `harness/binaries/`. Storage stays in Connect.
  - `binaryAt(harness, path | null): Effect<BinaryInfo>` is today's `probe`.
  - `checkBinary(harness, given): Effect<string, InvalidBinary>` runs today's `expand`, `whyNotExecutable` and `check`, and returns the expanded path.
  - `InvalidBinary` is exported too.
- **`projectRaw(harnesses)(raw): Projected | null`** sends an `'engine'` Raw to `ConversationRaw.project` and any other Raw to its harness's `project`. It is used by Connect's feeds.

### `apps/connect` (after P5)

```
apps/connect/
  package.json  README.md  CONTEXT.md (exists)  CHANGELOG.md  LICENSE (copy of ai-toolkit's)
  laymos.config.json  tsconfig.json  tsconfig.build.json  tsconfig.types.json
  portless.json              { "name": "connect.kishore" }
  alchemy.run.ts             Stack 'Connect': Cloud Connect
  bin/ke-connect.mjs         #!/usr/bin/env node  import '../dist/cli/index.js';
  scripts/dev.ts             import { runConnectDev } from '@kestack/connect/dev'; await runConnectDev();
  docs/kabuki-tree.md        the engine tree (Session → Conversation Child) and the Heartbeat
  docs/dev.md                runbook: per-branch Connect, ensure, leases, logs, reset a branch
  docs/adr/0001-…0005-…      moved from ai-toolkit (see P6)
  src/
    paths/          index.ts paths.ts xdg.ts windows.ts legacy.ts paths.test.ts legacy.test.ts
    origins/        index.ts origins.ts origins.test.ts
    cloud/                                   Wrapper: Cloud Connect
      contract/     index.ts contract.ts     ← kabuki/machine/backend/contract
      client/       index.ts client.ts       ← kabuki/machine/backend/client
      serve/        index.ts serve.ts serve.test.ts registry/ storage/   ← kabuki/machine/backend/serve
    machine/        index.ts machine.ts heartbeat.ts heartbeat.test.ts   ← kabuki/machine
      actor-heartbeat/  capabilities/  sign-in/  tunnel/
      identity/     index.ts identity.ts identity.test.ts secrets.ts file.ts legacy.ts
    code/                                    Wrapper: the `code` App Group
      records/      index.ts records.ts      ← services/records/entities
      contract/     index.ts contract.ts errors.ts folders.ts harnesses.ts jobs.ts projects.ts sessions.ts speech.ts turns.ts wire.ts   ← api/contract
      client/       index.ts client.ts       ← api/client
      storage/      index.ts store.ts table.ts store.test.ts               ← services/records/store
      engine/       index.ts engine.ts engine.test.ts features.test.ts     ← kabuki/engine
        capabilities/  index.ts desks.ts
        services/      index.ts desks.ts harness-binaries.ts folders/
        attachments/   index.ts attachments.ts files.ts                    ← engine/prompt (saving part)
        actor-projects/  index.ts actor.ts commands.ts sweep.ts
          actor-project/  index.ts actor.ts
            actor-session/  index.ts actor.ts desk.ts fork.ts title.ts title.test.ts keeper.ts
      group/        index.ts group.ts live.ts read/   ← api/live (handlers, feeds)
    server/         index.ts server.ts machine-key.ts server.test.ts       ← cli/server
    serve/          index.ts serve.ts logs.ts serve.test.ts                ← cli/cli.ts (the serve body)
    cli/            index.ts cli.ts                                        ← cli/cli.ts (the flags)
    dev/            index.ts dev.ts branch.ts lock.ts leases.ts ensure.ts supervise.ts supervisor.ts with-connect.ts dev.test.ts
    doors/
      code/         index.ts code.ts         door ./code
    deploy/
      infra/        index.ts stage.ts cloud-connect.ts
      worker.server.ts                       fileModule: the Worker entry
```

#### The Session actor after P4 (`code/engine/actor-projects/actor-project/actor-session/`)

- **Requires**: `Desks`, `Harnesses`, `HarnessBinaries`, `OneShotPrompt`, `Store`.
- **Input**: `{ session (stored, with status), cwd, first: Prompt | null }`, as today.
- **Model**: `session` (the record without status), `cwd`, `untitled`, `first`, `standing`. `standing` is `{ status, turnId }`, from the last `Stands`. It has no States.
- **Messages**:
  - `Stands { …ConversationStanding }` copies `nativeId`, `model` and `settings` into the record.
  - It sets `activeAt` and `endedAt` when they are not null.
  - It un-settles the Session when `sentAt` moved on.
  - It sets `standing`.
  - The other messages are `Titled`, `Settle` and `Unsettle`.
- **Provides** at the top, through `keeper.ts`:
  - `ConversationKeeper.keep` appends to the Store (`store.append({ sessionId, turnId, source, out })`, see storage).
  - `ConversationKeeper.stands` is a `self.send({ _tag: 'Stands', … })`.
- **Children**: `conversation: { actor: Conversation.actor, input }`. The input is built from the Model:
  - `id` is the session id.
  - `ended` is the stored status when it is `cancelled`, `failed` or `interrupted`, else null.
  - `first` is `model.first`.
- **Workers**:
  - `desk`, always. The Desk now holds only `fork`, `retitle` and `ask`. `fork` reads the running Turn from `standing.turnId`.
  - `persist`, always. The record's status comes from `standing.status`.
  - `title`, while untitled. It asks `OneShotPrompt` with Connect's title prompt.
- **The engine** (`engine.ts`) reaches the live Conversation as `session.children.conversation`. It sends `Send`, `Cancel` and `StopJob` there, asks `mcpStatus` and `contextUsage` there, and reads `jobs` and `refusedStops` there for `backgroundJobs` and `stopBackgroundJob`. Settle, Unsettle and Titled still go to the Session.
- **The Runtime Layer** is `Store`, `Harnesses`, `OneShotPrompt`, `HarnessBinaries`, `Desks` and `Conversation.agents`.

#### The Machine's one socket (`server/`)

- `server({ port, host?, origins, key, groups })`.
  - It serves every App Group on `/rpc` over WebSocket, merged into one RpcGroup.
  - It adds the key guard and the origin guard, and serves `/health` without the key.
  - `groups` is `{ api, layer }` for each App Group. Today that is only `codeGroup(…)`.
- `port: 0` binds any free port. The actual port is read back from Effect's `HttpServer` address and handed to `online` and to `onListening`.
- App Groups merge with flat procedure names, unique across every group, as ai-toolkit ADR 0004 already rules (see Open questions).
- `DEFAULT_ORIGINS` becomes:
  - `http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*`, `https://localhost:*` and `https://*.localhost:*`;
  - `https://*.kishore.app` and `https://*.kishore.computer`.

#### Cloud Connect (`cloud/serve/`, `deploy/`)

- `serve({ auth: AuthOptions, origins: ReadonlyArray<string>, database })`.
  - `origins` are patterns from `src/origins`. A request whose `Origin` matches gets credentialed CORS, with its own origin echoed and `Vary: Origin`.
  - Any other origin gets 403. No Origin at all, as from a Machine, goes ahead.
  - This replaces `site`.
- `serveOver({ guard, authInfo, origins, driver })` stays as the test seam. Tests keep using auth-toolkit's `fakeGuard`.
- `AuthInfo` is `{ url }` only. The `{ local: true }` variant, the `fakeGuard` branch in `serve`, and the registry's `{ local }` option are deleted.
- **`deploy/worker.server.ts`**:
  - Env: `AUTH_URL` (required), `ALLOWED_ORIGINS` (comma-separated patterns, required), and `DB`.
  - It calls `serve({ auth: { url: env.AUTH_URL }, origins: env.ALLOWED_ORIGINS.split(','), database: env.DB })` once and caches it.
- **`deploy/infra/stage.ts`**:
  - `CONNECT = { host: 'connect', zone: 'kishore.app' }`.
  - `where` comes from `@kestack/web-platform/app/alchemy`.
  - Auth URL: `https://auth.kishore.computer` under `alchemy dev`, else `https://auth.kishore.app`.
  - Origins: `https://*.kishore.computer` under `alchemy dev`, else `https://*.kishore.app`.
- **`deploy/infra/cloud-connect.ts`**:
  - `Cloudflare.D1.Database('CloudConnectDatabase', { name: \`connect-${stage}\` })`.
  - `D1.table('MachinesTable', { table: machinesTable, database, mode: 'persistent' })`.
  - `Cloudflare.Worker('CloudConnect', { main: './src/deploy/worker.server.ts', compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] }, domain: at.domain(), dev: at.dev ? { port: portlessPort(), strictPort: true } : undefined, env: { AUTH_URL, ALLOWED_ORIGINS, DB }, tag: Output.map(table.snapshot, () => 'machines') })`.
- **`alchemy.run.ts`**:

  ```ts
  Stack(
    'Connect',
    {
      providers: stdToolkitProviders().pipe(
        Layer.provideMerge(Cloudflare.providers()),
      ),
      state: State,
    },
    CloudConnect,
  );
  ```

- **Where it lands**: production at `connect.kishore.app`, a PR at `pr<N>-connect.kishore.app`. Under `alchemy dev` it is Portless's `[<prefix>.]connect.kishore.computer`.

#### Doors and `package.json` of `@kestack/connect`

| Door                      | Side that imports it                      | Points at                | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kestack/connect/code`   | Code's browser                            | `dist/doors/code/index`  | Everything in today's `api` door under its new names (`CodeApi`, schemas, errors, types, plus what it re-exports from `@kestack/ai-toolkit/contract`); today's `client` door (`CodeClient`, `CodeClients`, `CodeReplica`, `CodeReplicaLive`, `MachineAddress`, `connection`); Cloud Connect's contract (`CloudApi`, `Machine`, `MachineReport`, `MachineStatus`, `TunnelCheck`, `MachineForgotten`, `MachineTaken`, `addressOf`, `RPC_PATH`, `AUTH_PATH`) and its client (`CloudClient`) |
| `@kestack/connect/worker` | a Cloudflare Worker serving Cloud Connect | `dist/cloud/serve/index` | `serve`, `serveOver`, `machinesTable`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@kestack/connect/node`   | a Node program starting a Connect         | `dist/serve/index`       | `serve`, `logout`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@kestack/connect/dev`    | monorepo dev scripts (P5)                 | `dist/dev/index`         | `runConnectDev`, `withConnect`, `ensureConnect`, `branchOf`                                                                                                                                                                                                                                                                                                                                                                                                                              |

```jsonc
{
  "name": "@kestack/connect",
  "version": "0.0.2", // the stack group's current version; the first release bumps all to 0.0.3
  "description": "Connects a computer to the cloud as a Machine its User reaches from anywhere: the ke-connect command, Cloud Connect on a Cloudflare Worker, and the code App Group Code talks to",
  "repository": {
    "type": "git",
    "url": "https://github.com/pkishorez/monorepo",
    "directory": "apps/connect",
  },
  "license": "MIT",
  "type": "module",
  "bin": { "ke-connect": "bin/ke-connect.mjs" },
  "files": ["bin", "dist", "README.md", "LICENSE"],
  "exports": {
    "./code": {
      "types": "./dist/doors/code/index.d.ts",
      "default": "./dist/doors/code/index.js",
    },
    "./worker": {
      "types": "./dist/cloud/serve/index.d.ts",
      "default": "./dist/cloud/serve/index.js",
    },
    "./node": {
      "types": "./dist/serve/index.d.ts",
      "default": "./dist/serve/index.js",
    },
    "./dev": {
      "types": "./dist/dev/index.d.ts",
      "default": "./dist/dev/index.js",
    },
  },
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json && tsc -p tsconfig.types.json",
    "dev": "vp run --filter '@kestack/connect...' build && node scripts/dev.ts",
    "deploy": "alchemy deploy",
    "deploy:prod": "ALLOW_DEPLOY=true alchemy deploy --stage prod",
    "fmt": "vp fmt",
    "lint": "vp check && pnpm lint:tsc && laymos lint",
    "lint:tsc": "tsc --noEmit",
    "test": "vitest run --exclude \"**/*.e2e.test.ts\"",
  },
  "dependencies": {
    "@effect/platform-node": "catalog:",
    "@kestack/ai-toolkit": "workspace:*",
    "cloudflared": "catalog:",
  },
  "peerDependencies": {
    "@kestack/auth-toolkit": "workspace:*",
    "@kestack/kabuki": "workspace:*",
    "@kestack/rpc-toolkit": "workspace:*",
    "@kestack/std-toolkit": "workspace:*",
    "@tanstack/db": "0.15.2",
    "effect": "^4.0.0",
  },
  "devDependencies": {
    "@alchemy.run/cloudflare": "catalog:",
    "@cloudflare/workers-types": "catalog:",
    "@kestack/auth-toolkit": "workspace:*",
    "@kestack/kabuki": "workspace:*",
    "@kestack/rpc-toolkit": "workspace:*",
    "@kestack/std-toolkit": "workspace:*",
    "@kestack/web-platform": "workspace:*",
    "@tanstack/db": "catalog:",
    "@tsconfig/node22": "catalog:",
    "@types/node": "catalog:",
    "alchemy": "catalog:",
    "effect": "catalog:",
    "laymos": "workspace:*",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:",
  },
  "engines": { "node": ">=24" },
}
```

- **Peers** are what must be the same instance as the App's: Effect, Kabuki, std-toolkit's Replica, and TanStack DB. npx installs them for `npx @kestack/connect serve`.
- **ai-toolkit** is a plain dependency. No App imports it.
- **tsconfig**: copy ai-toolkit's `tsconfig.json` (nodenext, `.js` specifiers). Then:
  - Add `"types": ["node", "@cloudflare/workers-types"]`.
  - Include `src/**/*` and `alchemy.run.ts`.
- **`tsconfig.build.json`**: like ai-toolkit's, excluding `src/**/*.test.ts`, `src/deploy` and `alchemy.run.ts`.
- **Deploy files**: `src/deploy/**` and `alchemy.run.ts` use `.ts` specifiers, as `apps/code` does. Alchemy bundles them; they are never built by tsc.
- **`tsconfig.types.json`** `files`: `src/doors/code/index.ts`, `src/cloud/serve/index.ts`, `src/serve/index.ts` and `src/dev/index.ts`.

#### `apps/connect/laymos.config.json`

```json
{
  "$schema": "../../devtools/laymos/schema.json",
  "sourceRoots": ["src"],
  "ignoredPaths": [],
  "fileModules": ["src/deploy/worker.server.ts"],
  "rules": {
    "src/cloud/client": ["src/cloud/contract"],
    "src/cloud/serve": ["src/cloud/contract", "src/origins"],
    "src/cloud/serve/registry": ["src/cloud/serve/storage"],
    "src/machine": ["src/cloud/contract", "src/cloud/client"],
    "src/machine/actor-heartbeat": ["src/machine/capabilities"],
    "src/code/contract": ["src/code/records"],
    "src/code/client": ["src/code/contract", "src/code/records"],
    "src/code/storage": ["src/code/records"],
    "src/code/engine": ["src/code/records", "src/code/storage"],
    "src/code/engine/actor-projects": [
      "src/code/engine/capabilities",
      "src/code/engine/attachments"
    ],
    "src/code/engine/services": ["src/code/engine/capabilities"],
    "src/code/group": [
      "src/code/contract",
      "src/code/engine",
      "src/code/records",
      "src/code/storage"
    ],
    "src/server": ["src/origins"],
    "src/serve": ["src/paths", "src/machine", "src/server", "src/code/group"],
    "src/cli": ["src/serve"],
    "src/dev": ["src/serve", "src/paths"],
    "src/doors/code": [
      "src/code/contract",
      "src/code/client",
      "src/code/records",
      "src/cloud/contract",
      "src/cloud/client"
    ],
    "src/deploy/infra": ["src/cloud/serve"],
    "src/deploy/worker.server.ts": ["src/cloud/serve"]
  }
}
```

#### `toolkits/ai-toolkit/laymos.config.json` (after P4)

```json
{
  "$schema": "../../devtools/laymos/schema.json",
  "sourceRoots": ["src"],
  "ignoredPaths": [],
  "fileModules": [],
  "rules": {
    "src/harness": ["src/contract"],
    "src/harness/claude": ["src/harness/contract"],
    "src/harness/claude/live-conversation": ["src/harness/claude/project"],
    "src/harness/codex": ["src/harness/contract"],
    "src/harness/codex/catalog": ["src/harness/codex/app-server"],
    "src/harness/codex/fork": ["src/harness/codex/app-server"],
    "src/harness/codex/project": [
      "src/harness/codex/app-server",
      "src/harness/codex/thread"
    ],
    "src/harness/codex/thread": [
      "src/harness/codex/app-server",
      "src/harness/codex/catalog"
    ],
    "src/harness/codex/one-shot": [
      "src/harness/codex/app-server",
      "src/harness/codex/catalog",
      "src/harness/codex/thread"
    ],
    "src/harness/binaries": ["src/harness/contract"],
    "src/harness/models": ["src/harness/contract"],
    "src/harness/conversation": ["src/harness/contract"],
    "src/harness/conversation/actor-conversation": [
      "src/harness/conversation/capabilities"
    ],
    "src/harness/fake": ["src/harness/contract"],
    "src/speech/actor-speech-model": [
      "src/speech/capabilities",
      "src/speech/contract"
    ],
    "src/speech/capabilities": ["src/speech/contract"],
    "src/speech/sherpa": ["src/speech/contract"],
    "src/speech/fake": ["src/speech/contract"]
  }
}
```

#### `toolkits/ai-toolkit/package.json` (after P4)

- **`description`**: "Effect-native Coding Harnesses: Claude Code and Codex Conversations in a folder with their Turn rules in one Kabuki actor, Forks, Asks, One-shot Prompts and Messages projected from Raw records; and Speech to Text on the computer". Keep `README.md`'s Signature identical.
- **No `bin`.** `files` is `["dist", "README.md", "LICENSE"]`.
- **`exports`**: `./contract`, `./harness`, `./harness/fake`, `./speech` and `./speech/fake`. They point at `dist/contract/index`, `dist/harness/index`, `dist/harness/fake/index`, `dist/speech/index` and `dist/speech/fake/index`. `tsconfig.types.json` `files` matches.
- **`tsconfig.build.json`** stops excluding `src/services/harness/fake`. Fakes are a door now.
- **`scripts`**: `build`, `fmt`, `lint`, `lint:tsc`, `test` and `test:e2e`, all unchanged. `dev`, `dev:local` and `dev:preview` are deleted.
- **`dependencies`**: `@anthropic-ai/claude-agent-sdk`, `@openai/codex` and `sherpa-onnx-node`. `cloudflared` and `@effect/platform-node` leave.
- **`peerDependencies`**: `@kestack/kabuki`, `@kestack/std-toolkit` and `effect`. `@kestack/auth-toolkit`, `@kestack/rpc-toolkit` and `@tanstack/db` leave. `devDependencies` match.
- **`portless.json`** is deleted.

#### `apps/code/package.json` (after P5)

- **`description`**: "The app for running Claude Code and Codex Sessions in Project folders on your Machines, through Connect, at code.kishore.app". Keep the README Signature in sync.
- **`dependencies`**: `@kestack/ai-toolkit` is replaced by `@kestack/connect: workspace:*`.
- **`scripts.dev`**: `vp run --filter 'code^...' build && node scripts/dev.ts`. `code^...` builds Connect too.
- **`scripts["dev:local"]`** is deleted.
- **`scripts/dev.ts`**:

  ```ts
  import { withConnect } from '@kestack/connect/dev';
  await withConnect({
    app: 'code',
    command: 'portless',
    args: ['run', '--force', 'alchemy', 'dev'],
  });
  ```

### Paths (`apps/connect/src/paths/`)

`resolvePaths({ branch?: string, env = process.env, platform = process.platform, home = os.homedir() }): ConnectPaths` is pure and tested.

| Kind   | macOS / Linux                                       | Windows                        |
| ------ | --------------------------------------------------- | ------------------------------ |
| config | `$XDG_CONFIG_HOME` or `~/.config`, + `/kestack`     | `%APPDATA%\kestack`            |
| data   | `$XDG_DATA_HOME` or `~/.local/share`, + `/kestack`  | `%LOCALAPPDATA%\kestack`       |
| state  | `$XDG_STATE_HOME` or `~/.local/state`, + `/kestack` | `%LOCALAPPDATA%\kestack\state` |
| cache  | `$XDG_CACHE_HOME` or `~/.cache`, + `/kestack`       | `%LOCALAPPDATA%\kestack\cache` |

- An `XDG_*` value is used only when it is an absolute path (the XDG spec ignores relative ones).
- On Windows a missing variable falls back to `~\AppData\Roaming` or `~\AppData\Local`.
- `branch` puts data and state under `.branches/<branch>/`. Config and cache are always shared.
- `branch` must match `/^[a-z0-9][a-z0-9-]{0,62}$/` (a Portless host label), else `resolvePaths` throws.

```ts
interface ConnectPaths {
  config: string; // <config>/connect                          reserved; nothing is written yet
  data: string; // <data>[/.branches/<b>]/connect            created 0700
  state: string; // <state>[/.branches/<b>]/connect           created 0700
  cache: string; // <cache>/connect
  db: string; // <data>/connect.db                         chmod 0600 after first open
  attachments: string; // <data>/attachments
  machine: string; // <data>/machine.json                       0600: id, name, Machine Key, owner
  log: string; // <state>/ke-connect.log
  dev: string; // <state>/dev                               lock, connect.json, leases/ (P5)
  cloudflared: string; // <cache>/bin/cloudflared[.exe]
  ai: {
    models: string; // <cache>/ai/models.json                    handed to ai-toolkit's Models
    speech: string; // <cache>/ai/speech-to-text                 handed to ai-toolkit's Speech
  };
}
```

- ai-toolkit picks no path. It is handed `ai.models` and `ai.speech`, and owns no data folder. `~/.local/share/kestack/ai/` is not created.
- `serve` writes its log lines to `log` as well as to the console. If the file is over 10 MB at start, it is truncated first.

**First production run (`legacy.ts`, `moveLegacy(paths)`).** It runs only without `branch`, and only when `~/.ai-toolkit/ai.db` exists and `paths.db` does not. Each step renames, falling back to copy then delete across devices, and logs a line.

1. `ai.db` → `paths.db`, and the same for `ai.db-wal` and `ai.db-shm` if present.
2. `attachments/` → `paths.attachments`. Then a symlink `~/.ai-toolkit/attachments` → `paths.attachments`, because old Raw records name those absolute paths.
3. `models.json` → `paths.ai.models`.
4. `speech-to-text/` → `paths.ai.speech`.
5. `bin/cloudflared` → `paths.cloudflared`.
6. Write `~/.ai-toolkit/MOVED.txt`, naming the new folders.

`dev.db`, `dev-local.db` and `preview.db` are left alone.

The Machine moves inside `machine/identity`:

- `claim` reads `paths.machine` first.
- When that file is missing and the db holds a record in the legacy `ai-toolkit-machine` table (`identity/legacy.ts`, today's `table.ts`), it writes `machine.json` (0600) with the same id and key, then sets the legacy record to null.

So a moved Machine keeps its id and Machine Key and registers again on the fresh Cloud Connect, as ADR 0011 says.

**Machine name.** In development the first name is `` `${hostname()} (${branch})` ``, cut to 64 characters. `--name` still renames and is kept.

### CLI (`ke-connect`)

- **`ke-connect serve`**:
  - `--port, -p`: `PORT` env, else 4590; `0` means any free port.
  - `--cloud`: `KE_CONNECT_CLOUD` env, else `https://connect.kishore.app`.
  - `--origin` (repeatable), `--name` and `--heartbeat` (seconds, 15).
  - `--branch`: `KESTACK_BRANCH` env. It takes the paths under `.branches/<branch>`; it is for development.
- **`ke-connect logout`**: `--cloud` and `--branch`.
- **Removed flags**: `--db`, `--backend` and `--as`.
- `cli.ts` only parses flags and calls `serve` or `logout` from `src/serve`. On failure it exits with `reasonOf`'s message, as today.
- **`serve(options)`** in `src/serve/serve.ts` returns an `Effect` that runs until stopped, scoped:

  ```ts
  interface ServeOptions {
    readonly cloud: string;
    readonly port?: number; // 4590; 0 = any free port
    readonly branch?: string;
    readonly name?: string;
    readonly origins?: ReadonlyArray<string>; // added to DEFAULT_ORIGINS
    readonly heartbeat?: number; // seconds
    readonly paths?: ConnectPaths; // tests
    readonly harnesses?: Layer.Layer<Harnesses | OneShotPrompt>; // tests: fakes; default claude + codex + codexOneShot
    readonly speech?: Layer.Layer<SpeechToText>; // tests: fake; default sherpa()
    readonly onListening?: (info: {
      readonly port: number;
      readonly machine: { readonly id: string; readonly name: string };
    }) => Effect.Effect<void>;
  }
  ```

  It runs these steps in order:
  1. Resolve the paths.
  2. Call `moveLegacy`, without a branch only.
  3. Make the folders.
  4. `identify`.
  5. Build the server Layer with `codeGroup(…)`.
  6. Race `Layer.launch(server)` against `online(identified, { port, every, cloudflared: paths.cloudflared })`.
  7. Call `onListening` once the socket is bound.

## Inventory

### ai-toolkit `src/**`: every file and where it ends up

"→ connect" means `apps/connect/src/…`. "→ ai" means `toolkits/ai-toolkit/src/…` in the final layout.

**`src/cli/`**

| File                               | Destination                                                                | Phase  |
| ---------------------------------- | -------------------------------------------------------------------------- | ------ |
| `cli/cli.ts`                       | split: flags → connect `cli/cli.ts`; serve body → connect `serve/serve.ts` | P2     |
| `cli/index.ts`                     | → connect `cli/index.ts`                                                   | P2     |
| `cli/server/index.ts`, `server.ts` | → ai `src/server/` (temporary door) in P2, → connect `server/` in P3       | P2, P3 |
| `cli/server/machine-key.ts`        | as `server.ts` (subprotocol renamed in P3)                                 | P2, P3 |
| `cli/server/origins.ts`            | deleted. Connect's `origins/origins.ts` (P1 copy) replaces it              | P3     |
| `cli/server/server.test.ts`        | as `server.ts`                                                             | P2, P3 |

**`src/kabuki/machine/`**: all of it goes to connect in P2.

| File(s)                                                                                           | Destination                                                                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `index.ts`, `machine.ts`, `heartbeat.ts`, `heartbeat.test.ts`                                     | `machine/`                                                                                              |
| `actor-heartbeat/actor.ts`, `index.ts`                                                            | `machine/actor-heartbeat/`                                                                              |
| `capabilities/heartbeat-host.ts`, `index.ts`                                                      | `machine/capabilities/`                                                                                 |
| `identity/identity.ts`, `identity.test.ts`, `index.ts`, `secrets.ts`                              | `machine/identity/` (machine.json via new `file.ts`)                                                    |
| `identity/table.ts`                                                                               | `machine/identity/legacy.ts` (read once, then nulled)                                                   |
| `sign-in/sign-in.ts`, `sign-in-store.ts`, `index.ts`                                              | `machine/sign-in/` (`as`, `asLocal` and the Local branches removed)                                     |
| `sign-in/local.ts`                                                                                | deleted                                                                                                 |
| `tunnel/binary.ts`, `check.ts`, `quick-tunnel.ts`, `tunnel.ts`, `index.ts`                        | `machine/tunnel/` (binary path from options, not `~/.ai-toolkit/bin`)                                   |
| `backend/contract/contract.ts`, `index.ts`                                                        | `cloud/contract/` (`CloudApi`; `AuthInfo` is `{ url }` only; `version` documented as Connect's version) |
| `backend/client/client.ts`, `index.ts`                                                            | `cloud/client/` (`CloudClient`)                                                                         |
| `backend/serve/backend.ts`, `backend.test.ts`, `index.ts`                                         | `cloud/serve/serve.ts`, `serve.test.ts`, `index.ts` (origins replace `site`; Local mode gone)           |
| `backend/serve/registry/registry.ts`, `index.ts`                                                  | `cloud/serve/registry/` (the `{ local }` option and `callerOf`'s `local` removed)                       |
| `backend/serve/storage/storage.ts`, `storage.test.ts`, `index.ts`, `machines-table.snapshot.json` | `cloud/serve/storage/` (unchanged)                                                                      |

**`src/kabuki/engine/`**: to connect `code/engine/` in P3, then split in P4.

| File(s)                                                                                                    | P3 destination (connect)        | P4 change                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`, `engine.ts`                                                                                    | `code/engine/`                  | Reaches `session.children.conversation`; no `promptOf`, `attachments.save` instead                                                                                                          |
| `engine.test.ts`, `features.test.ts`                                                                       | `code/engine/`                  | Turn-rule cases copied to ai `harness/conversation/conversation.test.ts`; Session cases (title, settle, fork, sweep, persist) stay                                                          |
| `capabilities/desks.ts`, `index.ts`                                                                        | `code/engine/capabilities/`     | `Desk` keeps `fork`, `retitle`, `ask` only                                                                                                                                                  |
| `services/index.ts`, `services/desks.ts`                                                                   | `code/engine/services/`         | unchanged                                                                                                                                                                                   |
| `services/harness-binaries.ts`                                                                             | `code/engine/services/`         | Keeps `storedHarnessBinaries`, `binaryRow`, `setBinary` and `HarnessBinaryRow` over the Store; `probe` and `check` → ai `harness/binaries/binaries.ts`                                      |
| `services/executable.ts`                                                                                   | `code/engine/services/`         | → ai `harness/binaries/executable.ts`                                                                                                                                                       |
| `services/folders/folders.ts`, `folders.test.ts`, `git.ts`, `home.ts`, `index.ts`, `listing.ts`, `name.ts` | `code/engine/services/folders/` | unchanged                                                                                                                                                                                   |
| `prompt/prompt.ts`, `files.ts`, `index.ts`                                                                 | `code/engine/prompt/`           | `Prompt`, `toTurnInput`, `isImage`, `sizeOf` → ai `harness/conversation/prompt.ts`; `promptOf`, `SaveAttachments`, `keep`, `safeName` → connect `code/engine/attachments/` (folder renamed) |
| `engine-raw/engine-raw.ts`, `index.ts`                                                                     | `code/engine/engine-raw/`       | → ai `harness/conversation/raw.ts` as `ConversationRaw`; `stamp` and `RawContext` → connect `code/storage/store.ts` (`append`)                                                              |
| `actor-projects/actor.ts`, `commands.ts`, `index.ts`, `sweep.ts`                                           | `code/engine/actor-projects/`   | `sweep` reads `ConversationRaw`                                                                                                                                                             |
| `actor-projects/actor-project/actor.ts`, `index.ts`                                                        | `.../actor-project/`            | unchanged                                                                                                                                                                                   |
| `actor-session/actor.ts`                                                                                   | `.../actor-session/`            | Split: Turn rules, jobs and queries → ai `actor-conversation/actor.ts`; record, title, settle, persist, keeper and the Child stay                                                           |
| `actor-session/turn.ts`                                                                                    | `.../actor-session/`            | → ai `actor-conversation/turn.ts` (`keeper.keep`)                                                                                                                                           |
| `actor-session/commands.ts`                                                                                | `.../actor-session/`            | → ai `actor-conversation/commands.ts`                                                                                                                                                       |
| `actor-session/services/agent.ts`, `services/index.ts`                                                     | `.../actor-session/services/`   | → ai `actor-conversation/services/`                                                                                                                                                         |
| `actor-session/desk.ts`                                                                                    | `.../actor-session/`            | No agent; `fork`, `retitle` and `ask` only                                                                                                                                                  |
| `actor-session/fork.ts`                                                                                    | `.../actor-session/`            | Reads `ConversationRaw.endedOf`; the running Turn from `standing`                                                                                                                           |
| `actor-session/title.ts`                                                                                   | `.../actor-session/`            | Asks `OneShotPrompt`; gains `prompt()`, `clean`, `MAX_WORDS` and `MESSAGE_CHARS` from codex `titler.ts`, and `title.test.ts` (today's `titler.test.ts`)                                     |
| `actor-session/index.ts`                                                                                   | `.../actor-session/`            | exports `Session` and `SessionInput`                                                                                                                                                        |
| (new)                                                                                                      |                                 | `actor-session/keeper.ts`: the `ConversationKeeper` Provide                                                                                                                                 |

**`src/kabuki/speech/`**: to ai `speech/` in P3.

| File(s)                                   | Destination                  |
| ----------------------------------------- | ---------------------------- |
| `index.ts`, `speech.ts`, `speech.test.ts` | `speech/`                    |
| `actor-speech-model/actor.ts`, `index.ts` | `speech/actor-speech-model/` |
| `capabilities/speech-host.ts`, `index.ts` | `speech/capabilities/`       |

**`src/api/`**: to connect in P3.

| File(s)                                                                                                                                                    | Destination                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `contract/contract.ts`, `errors.ts`, `folders.ts`, `harnesses.ts`, `index.ts`, `jobs.ts`, `projects.ts`, `sessions.ts`, `speech.ts`, `turns.ts`, `wire.ts` | `code/contract/` (`CodeApi`; `ModelInfo` moves to ai `contract/wire` and is re-exported here)                                 |
| `client/client.ts`, `index.ts`                                                                                                                             | `code/client/` (renames per the Ground rules)                                                                                 |
| `live/index.ts`, `live/live.ts`                                                                                                                            | `code/group/index.ts`, `live.ts` (+ new `group.ts`: `codeGroup(options)`, the wiring that is in `cli/server/server.ts` today) |
| `live/read/follow.ts`, `read.ts`, `read.test.ts`, `index.ts`                                                                                               | `code/group/read/` (uses ai `projectRaw`)                                                                                     |
| `live/models/models.ts`, `models.test.ts`, `index.ts`                                                                                                      | → ai `harness/models/` (P3)                                                                                                   |

**`src/services/records/`**

| Folder                                                         | Destination               | Phase                               |
| -------------------------------------------------------------- | ------------------------- | ----------------------------------- |
| `raw/` (`index.ts`, `json.ts`, `raw.ts`)                       | ai `contract/raw/`        | P3                                  |
| `projection/` (`index.ts`, `message.ts`)                       | ai `contract/projection/` | P3                                  |
| `entities/` (`index.ts`, `records.ts`)                         | connect `code/records/`   | P3                                  |
| `store/` (`index.ts`, `store.ts`, `store.test.ts`, `table.ts`) | connect `code/storage/`   | P3; gains `append` (stamping) in P4 |

**`src/services/harness/`**: to ai `harness/` in P3, renamed in P4.

| Folder                                                                                                                                                           | Destination                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract/` (`harness.ts`, `index.ts`, `chunker/chunker.ts`, `chunker.test.ts`, `index.ts`)                                                                      | `harness/contract/`. P4: `LiveConversation`, `ConversationConfig`, `OneShotPrompt`; doc comments say Conversation, not session                                                              |
| `wire/` (`harness-wire.ts`, `index.ts`)                                                                                                                          | `contract/wire/` (browser-safe)                                                                                                                                                             |
| `claude/**`: `claude.ts`, `claude.e2e.test.ts`, `index.ts`, `settings.ts`, `catalog/*`, `project/*` (and `fixtures/*.json`), `sdk-session/**`, `session-files/*` | `harness/claude/`. P4: `sdk-session/` → `live-conversation/` (with `background-jobs/`, `status/`, `stream-chunks/`, `turn-end/`); `session-files/` keeps its name (Claude Code's own files) |
| `codex/**`: `codex.ts`, `codex.e2e.test.ts`, `index.ts`, `app-server/*`, `catalog/*`, `fork/*`, `project/*` (and `fixtures/*.json`), `thread/*`, `titler/*`      | `harness/codex/`. P4: `titler/` → `one-shot/` (`one-shot.ts`, `index.ts`); `titler.test.ts` → connect `title.test.ts`                                                                       |
| `fake/` (`fake-harness.ts`, `index.ts`)                                                                                                                          | `harness/fake/`. P4 adds `fake-one-shot.ts` (`fakeOneShot(reply \| (text) => reply)`)                                                                                                       |

**`src/services/speech/`**: to ai `speech/` in P3.

| Folder                                                                                                         | Destination        |
| -------------------------------------------------------------------------------------------------------------- | ------------------ |
| `contract/` (`index.ts`, `speech-to-text.ts`)                                                                  | `speech/contract/` |
| `sherpa/` (`download.ts`, `index.ts`, `recognizer.ts`, `sherpa-onnx-node.d.ts`, `sherpa.test.ts`, `sherpa.ts`) | `speech/sherpa/`   |
| `fake/` (`fake-speech.ts`, `index.ts`)                                                                         | `speech/fake/`     |

**ai-toolkit outside `src/`**

| File                 | Destination                                        | Phase |
| -------------------- | -------------------------------------------------- | ----- |
| `bin/ai-toolkit.mjs` | deleted (replaced by connect `bin/ke-connect.mjs`) | P2    |
| `portless.json`      | deleted                                            | P2    |

### `apps/code/src/**`: every ai-toolkit import that changes

Every one of these imports becomes `@kestack/connect/code`, with the renamed symbols.

**P2: `machines` and `machines/client`**

| File                                              | Change                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/app.tsx`                                     | `MachinesClient` → `CloudClient`; `VITE_MACHINES_URL` → `VITE_CONNECT_URL`; header comment |
| `src/layer/capabilities/machines.ts`              | `Machine` type (P2); `SpeechToTextState` type (P3)                                         |
| `src/layer/capabilities/saved-machines.ts`        | `Machine` type                                                                             |
| `src/layer/machine-health/machine-health.ts`      | `Machine` and the machine contract values                                                  |
| `src/layer/machine-health/machine-health.test.ts` | `Machine` type                                                                             |
| `src/layer/services/machines.ts`                  | `Machine` type                                                                             |
| `src/layer/services/saved-machines.ts`            | `Machine`                                                                                  |
| `src/shell/actors/machine-list/actor.ts`          | `Machine`, `MachinesClient` → `CloudClient` (P2); `SpeechToTextState`, `AiClients` (P3)    |
| `src/shell/actors/machine-list/api.ts`            | `MachinesClient` → `CloudClient` (P2); `AiClient`, `AiClients` (P3)                        |
| `src/shell/actors/machine-list/commands.ts`       | `Machine`, `MachinesClient` → `CloudClient`                                                |
| `src/shell/actors/machine-list/machines.test.ts`  | `Machine`, `MachinesClient` (P2); `AiClient`, `AiClients` (P3)                             |
| `src/shell/actors/machine-list/view.tsx`          | `serveCommand` returns `'npx @kestack/connect serve'`; `local` and `backend` deleted       |
| `src/shell/connection/connection.ts`              | `Machine` type                                                                             |
| `src/shell/pages/settings/machines/actor.ts`      | `Machine`                                                                                  |
| `src/shell/pages/settings/machines/view.tsx`      | `Machine` type; `authHome` is now always a string, so drop the null check                  |
| `src/shell/services/reach.test.ts`                | `Machine` type                                                                             |

**P2: local auth and deploy (not imports)**

| File                                       | Change                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/sign-in/sign-in.tsx`                  | Delete Local mode: `local`, `fakeAccounts`, `fakeAccountsTable`, `fakeChooser`, `chooser` and `LocalSignInDialog`. `accounts` is always `browser(…)`. `authHome: string`                                                                                                        |
| `src/sign-in/index.ts`                     | stop exporting `LocalSignInDialog`                                                                                                                                                                                                                                              |
| `src/shell/view.tsx`                       | remove `<LocalSignInDialog />` and its import                                                                                                                                                                                                                                   |
| `src/env.d.ts`                             | `VITE_AUTH_URL: string`, `VITE_CONNECT_URL: string`; `VITE_AUTH_LOCAL` and `VITE_MACHINES_URL` deleted                                                                                                                                                                          |
| `src/deploy/infra/workers.ts`              | deleted                                                                                                                                                                                                                                                                         |
| `src/deploy/machines-api/worker.server.ts` | deleted (and the folder)                                                                                                                                                                                                                                                        |
| `src/deploy/infra/stage.ts`                | Delete `localAuth`, `machinesDevUrl` and `MACHINES_DEV_PORT`. `where` returns `{ ...at, auth: { url }, connect }`, where `connect` is `process.env.CONNECT_URL` (required; message: "CONNECT_URL is set by `pnpm dev`") under `alchemy dev`, else `https://connect.kishore.app` |
| `src/deploy/infra/website.ts`              | env `{ VITE_AUTH_URL: at.auth.url, VITE_CONNECT_URL: at.connect }`; no `MachinesWorker`                                                                                                                                                                                         |
| `alchemy.run.ts`                           | `providers: Cloudflare.providers()` (std-toolkit's are no longer needed); comment                                                                                                                                                                                               |
| `laymos.config.json`                       | drop `src/deploy/machines-api/worker.server.ts` from `fileModules`                                                                                                                                                                                                              |
| `package.json`                             | add `@kestack/connect`; `dev` (interim, see P2); delete `dev:local`                                                                                                                                                                                                             |

**P3: `api` and `client`**

| File                                                                              | Imports to re-point                             |
| --------------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/layer/services/account-replicas.ts`                                          | `Ai` → `CodeReplica`                            |
| `src/layer/services/account-replicas.test.ts`                                     | `Ai` → `CodeReplica`                            |
| `src/shell/actor.ts`                                                              | `AiLive` → `CodeReplicaLive`                    |
| `src/shell/actors/dictation/actor.ts`                                             | `AiClients` → `CodeClients`                     |
| `src/shell/actors/dictation/api.ts`                                               | `AiClient`, `AiClients`                         |
| `src/shell/actors/dictation/dictation.test.ts`                                    | `api` errors and types; `AiClient`, `AiClients` |
| `src/shell/actors/dictation/view.test.tsx`                                        | `AiClients`                                     |
| `src/shell/actors/header/header.tsx`                                              | `Project`, `Session` types                      |
| `src/shell/actors/machine-list/actor.ts`                                          | `SpeechToTextState`; `AiClients`                |
| `src/shell/actors/machine-list/api.ts`                                            | `AiClient`, `AiClients`                         |
| `src/shell/actors/machine-list/machines.test.ts`                                  | `AiClient`, `AiClients`                         |
| `src/shell/actors/project-picker/actor.ts`                                        | `AiClients`; `Project`, `Session`               |
| `src/shell/actors/project-picker/folder-picker/api.ts`                            | `AiClient`, `AiClients`                         |
| `src/shell/actors/project-picker/project-picker.test.tsx`                         | `AiClients`                                     |
| `src/shell/actors/session-actions/actor.ts`                                       | `Session`; `AiClients`                          |
| `src/shell/actors/session-actions/api.ts`                                         | `AiClient`                                      |
| `src/shell/actors/session-actions/session-actions.test.tsx`                       | `AiClient`, `AiClients`                         |
| `src/shell/actors/session-switcher/actor.ts`                                      | `Project`, `Session`                            |
| `src/shell/actors/sidebar/moves.ts`, `moves.test.ts`                              | `Session`                                       |
| `src/shell/actors/sidebar/rows.ts`, `rows.test.ts`                                | `Project`, `Session`                            |
| `src/shell/actors/sidebar/settled-list/settled-list.tsx`, `settled-list.test.tsx` | `Project`, `Session`                            |
| `src/shell/actors/sidebar/sidebar.tsx`                                            | `Project`, `Session`                            |
| `src/shell/moves/moves.ts`, `moves.test.ts`                                       | `AiClient`, `AiClients`                         |
| `src/shell/pages/home/view.tsx`                                                   | `Project`                                       |
| `src/shell/pages/project/actor.ts`                                                | `AiClient` (type), `AiClients`                  |
| `src/shell/pages/project/catalog/api.ts`                                          | `HarnessName`; `AiClient`                       |
| `src/shell/pages/project/catalog/catalog.ts`                                      | `HarnessInfo`, `ModelInfo`, `SkillSchema`       |
| `src/shell/pages/project/commands.ts`                                             | `AiClient`, `AiClients`                         |
| `src/shell/pages/project/draft/actor.ts`                                          | `HarnessInfo`; `AiClient`                       |
| `src/shell/pages/project/draft/commands.ts`                                       | `api` errors; `AiClient`                        |
| `src/shell/pages/project/draft/draft.test.ts`                                     | `SessionNotFound`; `AiClient`                   |
| `src/shell/pages/project/draft/message.ts`                                        | `AttachmentSchema`                              |
| `src/shell/pages/project/draft/skills.ts`                                         | `SkillSchema`                                   |
| `src/shell/pages/project/session/actor.ts`                                        | `AiClient`; `api` types                         |
| `src/shell/pages/project/session/commands.ts`                                     | `AiClient`                                      |
| `src/shell/pages/project/session/transcript/earlier.ts`, `earlier.test.ts`        | `Message`                                       |
| `src/shell/pages/project/session/transcript/thread.ts`, `thread.test.ts`          | `Message`, `Part`, `Usage`                      |
| `src/shell/pages/project/session/transcript/tools.ts`, `tools.test.ts`            | `Part`                                          |
| `src/shell/pages/project/session/transcript/transcript.tsx`                       | `Part`, `ToolKind`, `Usage`                     |
| `src/shell/pages/project/session/view.tsx`                                        | `Session`                                       |
| `src/shell/pages/settings/machines/harness-binaries/actor.ts`                     | `AiClients`; `HarnessBinary`, `HarnessInfo`     |
| `src/shell/pages/settings/machines/harness-binaries/api.ts`                       | `AiClient`, `AiClients`                         |
| `src/shell/pages/settings/machines/harness-binaries/commands.ts`                  | `HarnessInfo`; `AiClient`, `AiClients`          |
| `src/shell/pages/settings/machines/harness-binaries/view.tsx`                     | `HarnessBinary`                                 |
| `src/shell/pages/settings/machines/speech-to-text/actor.ts`                       | `SpeechToTextState`; `AiClients`                |
| `src/shell/pages/settings/machines/speech-to-text/commands.ts`                    | `AiClient`, `AiClients`                         |
| `src/shell/pages/settings/machines/speech-to-text/speech-to-text.test.tsx`        | `SpeechToTextState`; `AiClient`, `AiClients`    |
| `src/shell/refusal/refusal.ts`                                                    | `api` errors                                    |
| `src/shell/replica/replica.ts`                                                    | `Project`, `Session`; `Ai` → `CodeReplica`      |
| `src/shell/services/reach.ts`                                                     | `AiClients`, `MachineAddress`                   |
| `src/ui/session-status/session-status.tsx`                                        | `Session`                                       |
| `src/ui/status-dot/status-dot.tsx`                                                | `Session`                                       |
| `src/layer/capabilities/machines.ts`                                              | `SpeechToTextState`                             |

Check: `grep -rn "@kestack/ai-toolkit" apps/code` returns nothing after P3.

## Phases

Each phase is one PR off `main`, rebased, and green on its own. Merge with `gh pr merge --rebase`. Each phase that changes a package adds its changeset; every changeset bumps `patch`.

### P1: scaffold `apps/connect`, paths, origins

**Goal**: an empty, published-shaped `@kestack/connect` with two pure modules and their tests. Nothing uses it yet.

**Steps**:

1. Create `apps/connect/` with the following files:
   - `package.json`: the final one without `dev`, `deploy` or `deploy:prod`, without the `./node`, `./worker`, `./code` and `./dev` exports, and without `bin`. Use `"exports": {}` for now.
   - `tsconfig*.json`, `laymos.config.json` (rules: none yet), `LICENSE` and `portless.json`.
   - A `README.md` stub in the five-section shape, with the Signature equal to `description`.
2. Write `src/paths/` (`resolvePaths`, `moveLegacy`) and its tests:
   - XDG overrides; a relative XDG value ignored.
   - Windows variables; branch folders; a bad branch rejected.
   - A legacy move in a temp HOME (each step; a second run does nothing; the attachments symlink).
3. Write `src/origins/`: copy `allowsOrigin` from `toolkits/ai-toolkit/src/cli/server/origins.ts`, plus tests for `https://*.kishore.app` (`https://code.kishore.app`, `https://pr12-code.kishore.app` yes; `https://kishore.app`, `https://evil.app` no).
4. Add `@kestack/connect` to the stack group in `.changeset/config.json` `fixed`, and to `.syncpackrc.json` "Internal dependencies use workspace:* everywhere".
5. Add `.changeset/connect-scaffold.md` with `'@kestack/connect': patch`: "New package: where Connect keeps its files."

**Files**: `apps/connect/**`, `.changeset/config.json`, `.syncpackrc.json`, `.changeset/connect-scaffold.md`, `pnpm-lock.yaml`.

**Verify**:

```sh
pnpm install
pnpm -F @kestack/connect build && pnpm -F @kestack/connect lint && pnpm -F @kestack/connect test
pnpm lint:syncpack && pnpm lint:vp
```

### P2: the Machine, Cloud Connect and the CLI move to Connect

**Goal**:

- `ke-connect serve` is the composition root, with XDG paths and the legacy move.
- ai-toolkit loses its `bin`, its CLI, its Machine and its `machines*` doors.
- Code reads Machines from Cloud Connect at `connect.kishore.app` and deploys no Machines Worker.
- Local auth is gone.
- The engine and `AiApi` are still served from ai-toolkit, through one temporary door.

**Steps**:

1. Move `src/kabuki/machine/**` per the inventory into connect `src/machine/` and `src/cloud/{contract,client,serve}/`.
   - Apply the renames.
   - Delete `sign-in/local.ts` and every `as` and Local branch (sign-in, registry, contract `AuthInfo`, `serve`).
   - Replace `site` with `origins`.
   - Add `identity/file.ts` (machine.json, written 0600 through a temp file and rename) and `identity/legacy.ts`.
   - Add the `cloudflared` path to `online` and to tunnel `binary.ts`.
   - `MachineOwnedByAnother`'s message says to run `ke-connect logout`.
2. In ai-toolkit:
   - Rename `src/cli/server/` → `src/server/`. Its tests stay in ai-toolkit this phase.
   - Add options `modelsCache` and `speechFolder` to `server(…)`, so Connect picks those paths. Today they derive from `dirname(db)`.
   - Set `DEFAULT_ORIGINS` to the final list.
   - Make `src/server/index.ts` the temporary door `./server`. It exports `server`, `ServerOptions`, `DEFAULT_ORIGINS`, `Harnesses`, `claude`, `codex`, `codexTitler`, `makeFakeHarness`, `FAKE_SKILLS` and `makeFakeSpeech`.
   - Stop excluding `src/services/harness/fake` from `tsconfig.build.json`.
   - Delete `bin/`, `src/cli/cli.ts`, `src/cli/index.ts`, `portless.json`, the `dev*` scripts, `bin` and `"bin"` in `files`, and the `./machines`, `./machines/client` and `./machines/backend` exports and their `tsconfig.types.json` entries.
   - Remove `cloudflared` and `@kestack/auth-toolkit` from the dependencies.
   - Update `laymos.config.json`: drop every `src/cli*` and `src/kabuki/machine*` rule, and add what lint asks for `src/server`.
3. In connect:
   - Write `src/serve/serve.ts`: `serve` and `logout`, per the CLI section. It uses ai-toolkit's `server` from `@kestack/ai-toolkit/server` with `db: paths.db`, `attachments: paths.attachments`, `modelsCache: paths.ai.models` and `speechFolder: paths.ai.speech`.
   - Write `src/serve/logs.ts`.
   - Write `src/cli/` and `bin/ke-connect.mjs`.
   - Add the `bin` and the exports `./node` and `./worker`, and `./code` with only the Cloud Connect contract and client in `src/doors/code/code.ts`.
4. Write connect `src/deploy/` and `alchemy.run.ts` (Cloud Connect, as above), plus the scripts `deploy` and `deploy:prod`.
5. Write connect `src/dev/` (foreground only for now) and `scripts/dev.ts`, plus the `dev` script and the `./dev` export:
   - `branch.ts`: `branchOf(cwd)` runs `portless get connect.kishore` in `cwd` and parses the hostname `[<prefix>.]connect.kishore.<tld>`. It returns `{ slug: prefix ?? 'main', cloud: url }`. Portless adds a prefix only in a linked git worktree (the last path part of the branch, made host-safe), so the main checkout is always `main`.
   - `runConnectDev()`:
     1. Spawn `portless run --force alchemy dev` in the package root (`fileURLToPath(new URL('../../', import.meta.url))`), stdio inherited.
     2. Wait until `GET <cloud>/auth` answers 200.
     3. Run `serve({ cloud, branch: slug, port: 0 })` in this process.
     4. On Ctrl-C, stop both.
     5. If the package root has no `alchemy.run.ts`, fail with "runConnectDev runs only in the monorepo".
6. Code:
   - Make every P2 change in the Code inventory.
   - Interim `dev`: `vp run --filter 'code^...' build && CONNECT_URL=$(portless get connect.kishore) portless run --force alchemy dev`. Run `pnpm -F @kestack/connect dev` beside it; P5 makes that automatic.
7. CI:
   - Add `.github/workflows/deploy-connect.yml` and `cleanup-connect.yml`, copied from the code workflows with these changes:
     - `apps/connect` in place of `apps/code`, and stack `Connect`.
     - Build with `pnpm --filter '@kestack/connect^...' run build`.
     - The affected-paths check is `^(apps/connect/|toolkits/ai-toolkit/|\.github/workflows/deploy-connect\.yml$)`.
     - Label `preview:connect`, and URLs `https://connect.kishore.app` and `https://$STAGE-connect.kishore.app`.
   - In `deploy-code.yml`, add `apps/connect/` to the affected check and drop the `api=` URLs from the summary.
8. Changesets:
   - `connect-machine.md`, `@kestack/connect: patch`: "`ke-connect serve` and `ke-connect logout`; the Machine, Cloud Connect at connect.kishore.app; files in XDG folders, moved once from ~/.ai-toolkit."
   - `ai-toolkit-no-machine.md`, `@kestack/ai-toolkit: patch`: "No bin, no Machine, no `machines` doors: they are in @kestack/connect."
   - `code-on-connect.md`, `code: patch`: "Machines come from Cloud Connect; no Local sign-in."

**Files**: `toolkits/ai-toolkit/{bin,portless.json,package.json,tsconfig.build.json,tsconfig.types.json,laymos.config.json}`, `toolkits/ai-toolkit/src/{cli,kabuki/machine,server}/**`, `apps/connect/**`, the `apps/code` files listed under P2, `.github/workflows/{deploy-code,deploy-connect,cleanup-connect}.yml`, `.changeset/*`.

**Verify**:

```sh
pnpm install
pnpm exec vp run --filter '@kestack/connect...' build
pnpm -F @kestack/ai-toolkit lint && pnpm -F @kestack/ai-toolkit test
pnpm -F @kestack/connect lint && pnpm -F @kestack/connect test
pnpm exec vp run --filter 'code...' build && pnpm -F code lint && pnpm -F code test
pnpm lint:syncpack && pnpm lint:vp
node apps/connect/bin/ke-connect.mjs serve --help        # shows --cloud, --branch; no --db, --as, --backend
grep -rn "AUTH_LOCAL\|dev:local\|--as\b" apps/code apps/connect toolkits/ai-toolkit/src   # nothing
```

Manual: run `pnpm -F @kestack/connect dev`, then in another terminal `pnpm -F code dev`. Sign in on Code. The Machine `<host> (main)` is listed, a Session runs, and its folders are under `~/.local/share/kestack/.branches/main/connect/`.

### P3: the `code` App Group moves to Connect; Code re-pointed; ai-toolkit to its final folders

**Goal**:

- Connect serves the `code` App Group from its own socket.
- Code imports only `@kestack/connect/code`.
- ai-toolkit has its final layout and doors, still with the old Session, Titler and HarnessSession names.
- Behaviour is unchanged.

**Steps**:

1. Move into connect, per the inventory:
   - `src/api/contract` → `code/contract`, `src/api/client` → `code/client` and `src/api/live` → `code/group`.
   - `src/services/records/entities` → `code/records` and `src/services/records/store` → `code/storage`.
   - `src/kabuki/engine` → `code/engine`.
   - ai-toolkit `src/server/` → connect `src/server/`.
2. Apply the P3 renames. `CodeApi` keeps flat procedure names. Change the subprotocol in `server/machine-key.ts` and `code/client/client.ts` together.
3. Write `code/group/group.ts`: `codeGroup({ store | db, attachments, home, harnesses, modelsCache, speechFolder, speech })` returns `{ api: CodeApi, layer }`.
   - The body is the wiring now in `server.ts`: Store, `Engine.layer`, `Models.layer`, `Speech.layer` and `CodeApiLive`.
   - `server.ts` keeps only the socket, the guards and `/health`, and takes `groups`.
4. Restructure ai-toolkit into the final tree:
   - `src/services/records/{raw,projection}` and `src/services/harness/wire` → `src/contract/…`. Move `ModelInfo` there.
   - `src/services/harness/*` → `src/harness/*`, and `src/api/live/models` → `src/harness/models`.
   - `src/kabuki/speech` plus `src/services/speech/*` → `src/speech/*`.
   - Write the door modules `src/contract/{index,contract}.ts` and `src/harness/{index,harness}.ts` (with `harnesses(list)` and `projectRaw(list)`).
   - Set exports to the final five, and delete `./api`, `./client` and `./server`.
   - Remove `@kestack/rpc-toolkit`, `@tanstack/db` and `@effect/platform-node` from ai-toolkit.
   - Laymos: the final rules, minus `binaries` and `conversation`.
5. Connect's engine and group import `@kestack/ai-toolkit/{contract,harness,speech}`. Tests import `@kestack/ai-toolkit/harness/fake` and `@kestack/ai-toolkit/speech/fake`.
   - Interim laymos rules for `code/engine/{prompt,engine-raw}`: copy ai-toolkit's current `src/kabuki/engine/*` rules with the new prefix.
6. `serve.ts` composes `server({ groups: [codeGroup(…)] })`.
7. Extend `src/doors/code/code.ts` with the code contract and client.
8. Code:
   - Make every P3 change in the Code inventory.
   - Replace `@kestack/ai-toolkit` with `@kestack/connect` in `dependencies`.
   - README sentence: the app talks to `@kestack/connect`.
9. Changesets:
   - `connect-code-group.md`, `@kestack/connect: patch`: "the code App Group: Projects, Sessions, Settled, Titles, storage and its RPC; `@kestack/connect/code` is what Code's browser imports."
   - `ai-toolkit-doors.md`, `@kestack/ai-toolkit: patch`: "doors are `contract`, `harness`, `harness/fake`, `speech`, `speech/fake`; `api` and `client` are gone."
   - `code-imports-connect.md`, `code: patch`.

**Files**: `toolkits/ai-toolkit/**` (src restructure, package.json, tsconfig*, laymos), `apps/connect/src/{code,server,serve,doors}/**`, `apps/connect/{package.json,laymos.config.json,tsconfig.types.json}`, the `apps/code` files listed under P3 and `apps/code/package.json`, `.changeset/*`.

**Verify**:

```sh
pnpm install
pnpm exec vp run --filter 'code...' build      # builds ai-toolkit, connect, code
pnpm -F @kestack/ai-toolkit lint && pnpm -F @kestack/ai-toolkit test
pnpm -F @kestack/connect lint && pnpm -F @kestack/connect test   # engine, features, server, read, store tests
pnpm -F code lint && pnpm -F code test
pnpm lint:syncpack && pnpm lint:vp
grep -rn "@kestack/ai-toolkit" apps/code                         # nothing
grep -rln "rpc-toolkit\|auth-toolkit\|@tanstack/db" toolkits/ai-toolkit/src    # nothing
```

Manual: as in P2. Also check that a page open from before P3 reconnects after both sides restart (same Replica name, new subprotocol).

### P4: ai-toolkit becomes harness-only (Conversation actor, One-shot Prompt), Connect's Session on top

**Goal**: the Turn rules live in ai-toolkit's one live Conversation actor. Connect's Session keeps the record, Title, Settled and storage, with the Conversation as its Child. Behaviour is unchanged.

**Steps**:

1. In ai-toolkit `harness/contract`:
   - Rename to `LiveConversation` and `ConversationConfig`.
   - Replace `Titler` with `OneShotPrompt`.
   - Update every use in claude and codex.
   - Rename claude `sdk-session/` → `live-conversation/` and codex `titler/` → `one-shot/` (`codexOneShot`).
2. Add `harness/binaries/` (`binaryAt`, `checkBinary`, `InvalidBinary`). Move connect's `services/executable.ts` here.
3. Add `harness/conversation/` per "The live Conversation actor":
   - Move connect `actor-session/turn.ts`, `commands.ts` and `services/agent.ts`.
   - Move the Turn-rule parts of `actor-session/actor.ts`.
   - Move `engine-raw.ts` (minus `stamp`) → `raw.ts`, and `Prompt`, `toTurnInput`, `isImage` and `sizeOf` → `prompt.ts`.
   - Add `report.ts`, `capabilities/{keeper,agents}.ts` and `services/agents.ts`.
4. Add `harness/fake/fake-one-shot.ts`.
5. Write `harness/conversation/conversation.test.ts`. Port the Turn-rule cases from connect's `engine.test.ts` and `features.test.ts`, run against a test parent that Provides an in-memory `ConversationKeeper`, over `makeFakeHarness`:
   - send starts a Turn; send while running steers; an untaken steer becomes the next Turn;
   - send while cancelling waits; cancel grace ends it cancelled;
   - an Agent-started Turn begins only while idle;
   - `stands` follows each change; `keep` gets records in order;
   - jobs, StopJob and refusals; `mcpStatus` answers `AgentClosed` while closed.
6. In connect:
   - Rewrite `actor-session/actor.ts` per "The Session actor after P4". Add `keeper.ts`.
   - Trim `desk.ts` and `capabilities/desks.ts` to `fork`, `retitle` and `ask`.
   - `fork.ts` uses `ConversationRaw` and `standing.turnId`.
   - `title.ts` uses `OneShotPrompt` with the title prompt. Move `clean` and its test here.
   - Rename `prompt/` → `attachments/` (saving files only).
   - `storage/store.ts` gains `append({ sessionId, turnId, source, out })`, which stamps.
   - `sweep.ts` uses `ConversationRaw`.
   - `engine.ts` talks to the `conversation` Child.
   - `services/harness-binaries.ts` uses `binaryAt` and `checkBinary`.
   - `group.ts` and `serve.ts` default to `harnesses([claude, codex])` merged with `codexOneShot`.
7. Update both laymos configs to the final ones, and both `docs/kabuki-tree.md` to the new trees.
8. Changesets:
   - `ai-toolkit-harness-only.md`, `@kestack/ai-toolkit: patch`: "a live Conversation is one Kabuki actor holding the Turn rules; One-shot Prompt replaces Titler; HarnessSession is LiveConversation; Harness Binaries are checked here, kept by the caller."
   - `connect-session-on-conversation.md`, `@kestack/connect: patch`.

**Files**: `toolkits/ai-toolkit/src/harness/**`, `toolkits/ai-toolkit/{laymos.config.json,docs/kabuki-tree.md}`, `apps/connect/src/code/{engine,storage,group}/**`, `apps/connect/src/serve/serve.ts`, `apps/connect/{laymos.config.json,docs/kabuki-tree.md}`, `.changeset/*`.

**Verify**:

```sh
pnpm exec vp run --filter 'code...' build
pnpm -F @kestack/ai-toolkit lint && pnpm -F @kestack/ai-toolkit test
pnpm -F @kestack/connect lint && pnpm -F @kestack/connect test
pnpm -F code lint && pnpm -F code test
grep -rn "Titler\|HarnessSession\|EngineRaw" toolkits/ai-toolkit/src apps/connect/src   # nothing
AI_TOOLKIT_E2E=1 pnpm -F @kestack/ai-toolkit test:e2e     # optional, needs logged-in claude and codex
```

Manual, on a dev Machine:

- send, steer, cancel, and send while cancelling;
- a Background Job that starts an Agent-started Turn;
- Fork after a Turn; Ask; regenerate the Title; Settle, then send to un-settle;
- kill `ke-connect` mid-Turn, restart it, and see the Session marked interrupted.

### P5: dev orchestration (ensure, leases, per-branch Connect)

**Goal**: `pnpm dev` in Code starts or reuses this branch's Connect and runs only Code's site against it. Connect stops when the last App using it exits.

**Files under `<paths.dev>`** (that is `~/.local/state/kestack/.branches/<slug>/connect/dev/`):

- `lock` is a mutex file, created with `open(…, 'wx')`, holding `{ pid, at }`. It is stale when its pid is dead or it is older than 60 s; a stale lock is removed and taken again. Retry every 100 ms for up to 30 s.
- `connect.json` is `{ pid, mode: 'foreground' | 'shared', cloud, port, machine: { id, name }, ready: boolean, startedAt, version }`, written through a temp file and rename.
- `leases/<pid>.json` is `{ pid, app, startedAt }`, one per App dev process using this Connect.
- `connect.log` is the shared supervisor's stdout and stderr.

**Modules in `apps/connect/src/dev/`**:

- **`branch.ts`** exports `branchOf(cwd)` (from P2) and a pure `slugOf(url, name)` for tests.
- **`lock.ts`** exports `withLock(dir, fn)`. **`leases.ts`** exports `take(app)`, `release()`, `live()` (dead pids are pruned) and `pidAlive(pid)` (`process.kill(pid, 0)`).
- **`ensure.ts`**: `ensureConnect({ app, cwd }) → Promise<{ cloud, release }>`.
  1. `branchOf(cwd)`, then `resolvePaths({ branch })`.
  2. Under the lock, read `connect.json`. It counts as alive when all of these hold:
     - its pid is alive;
     - `ready` is set;
     - `GET <cloud>/auth` answers 200;
     - `GET http://127.0.0.1:<port>/health` answers 200.

     If it is not alive and its pid is not alive either, spawn the supervisor: `spawn(process.execPath, [fileURLToPath(new URL('./supervisor.js', import.meta.url))], { cwd, detached: true, stdio: ['ignore', log, log], env: process.env })`, then `unref()`.

  3. Take a lease and release the lock.
  4. Until `connect.json` is alive, follow `connect.log` to this terminal. This shows a first sign-in's device code for a new branch. There is no timeout while the supervisor's pid lives; if it dies, fail and print the log path.
  5. `release` removes the lease. It is also bound to `exit`, `SIGINT`, `SIGTERM` and `SIGHUP`.
- **`supervise.ts`**: `runConnectDev({ mode = 'foreground' })`.
  1. Under the lock: if `connect.json` is alive, foreground mode attaches (takes a lease as `connect`, follows the log, and releases on Ctrl-C) and shared mode exits 0.
  2. Otherwise start Cloud Connect, as in P2. In shared mode its output goes to the log.
  3. Wait for `/auth`.
  4. Start `serve({ cloud, branch, port: 0, onListening })`. `onListening` writes `connect.json` with `ready: true`.
  5. Release the lock.
  6. Shared mode polls `leases/` every second. Once no live lease has existed for 3 s, it stops:
     - interrupt `serve` (closing the tunnel and the socket);
     - send SIGINT to the alchemy child, then SIGKILL after 10 s;
     - delete `connect.json`.
  7. Foreground mode stops everything on Ctrl-C. It first warns, naming any Apps that still hold leases.
- **`supervisor.ts`** is the entry the detached process runs: `runConnectDev({ mode: 'shared' })`.
- **`with-connect.ts`**: `withConnect({ app, command, args, cwd = process.cwd() })`.
  1. `ensureConnect`.
  2. Spawn `command args` with `env: { ...process.env, CONNECT_URL: cloud }` and stdio inherited.
  3. When the child exits, `release()` and exit with the child's code.
  4. SIGINT reaches the child through the shared process group. The supervisor is detached, so it does not get it; it stops once its last lease is gone.
- **`dev.test.ts`** covers `slugOf`, a stale lock taken over, dead leases pruned, and `connect.json` liveness with a fake fetch.

**Steps**:

1. Write the modules above, and export `runConnectDev`, `withConnect`, `ensureConnect` and `branchOf` from `src/dev/index.ts`.
2. Add `apps/code/scripts/dev.ts` and the final `dev` script (see Final shape).
3. Write `apps/connect/docs/dev.md`: the per-branch folders, how ensure, leases and stopping work, where the log is, and how to reset a branch by deleting `~/.local/{share,state}/kestack/.branches/<slug>`.
4. Changesets: `connect-dev.md` (`@kestack/connect: patch`) and `code-dev-ensures-connect.md` (`code: patch`).

**Files**: `apps/connect/src/dev/**`, `apps/connect/docs/dev.md`, `apps/code/scripts/dev.ts`, `apps/code/package.json`, `.changeset/*`.

**Verify**:

```sh
pnpm exec vp run --filter 'code...' build
pnpm -F @kestack/connect lint && pnpm -F @kestack/connect test
pnpm -F code lint
```

Manual:

1. With nothing running, `cd apps/code && pnpm dev`.
   - Connect starts; its log appears, with a device sign-in on the first run of a branch.
   - The Code site opens at Portless's `[<prefix>.]code.kishore.computer`.
   - The Machine `<host> (<slug>)` is listed.
2. In another terminal, `cd apps/connect && pnpm dev`. It attaches and does not start a second Connect.
3. Stop the attached `connect` dev. Code still works.
4. Stop Code with Ctrl-C. Within about 5 s:
   - `connect.json` is gone;
   - `portless list` shows no `connect.kishore` route;
   - `pgrep -fl supervisor.js` prints nothing.
5. In a linked worktree, the same flow gives a separate Machine, Cloud Connect and folder.

### P6: READMEs, CONTEXT, ADRs, changesets sweep

**Goal**: the docs say what the code does.

**Steps**:

1. READMEs, per `docs/readme-conventions.md`:
   - `apps/connect/README.md`: Signature equal to `description`, then Big picture, Install (`pnpm add @kestack/connect` plus each peer with why, and `npx @kestack/connect serve`), and Exports (one `###` per door: `./code`, `./worker`, `./node`, `./dev`).
   - Its Usage has three cases:
     - Serve a Machine (`ke-connect serve`; `serve()` from `./node`).
     - Talk to a Machine from a browser (`CloudClient`, `CodeClients`, `CodeReplicaLive`, lifted from `server.test.ts`).
     - Run Cloud Connect on a Worker (`serve` from `./worker`).
   - `docs/dev.md` is linked from Big picture.
   - `toolkits/ai-toolkit/README.md`: rewrite to the five doors and the new Signature. Install peers are only `effect`, `@kestack/kabuki` and `@kestack/std-toolkit`. Usage: run a live Conversation under a parent that keeps it; a One-shot Prompt; Speech to Text.
   - `apps/code/README.md`: Signature; Big picture (on Connect, no `dev:local`); Usage (`pnpm dev` ensures Connect; the deployed site uses `connect.kishore.app`).
   - Root `README.md`: add `@kestack/connect` to the stack list and table, and update ai-toolkit's row.
2. ADRs:
   - Copy ai-toolkit ADRs 0004, 0014, 0015, 0016 and 0018 to `apps/connect/docs/adr/0001…0005`, same titles. Each has a first line "Moved from toolkits/ai-toolkit/docs/adr/00NN".
   - In 0016's copy, replace the Local-mode consequence with "Local mode was removed (root ADR 0011)".
   - Give each ai-toolkit original the line `Status: moved to apps/connect/docs/adr/000N`.
   - Add to root ADR 0009 "Status: amended by ADR 0011: @kestack/connect joins the stack group."
3. Sweep for `ai-toolkit serve`, `Machines Backend`, `api-code`, `~/.ai-toolkit`, `dev:local`, `AUTH=local`, `VITE_MACHINES_URL` and `kstack` folder paths, and fix each hit:
   - `apps/code/{README.md,docs/*.md,qa/scenarios.md}`, `toolkits/ai-toolkit/docs/{turn-flow.md,v1-spec.md}` and `TODO.md`.
   - `v1-spec.md`: keep the Raw and projection parts and point its storage parts at Connect.
4. Re-read the three CONTEXT.md files against the code. Change nothing unless a term no longer matches what the code does.
5. Changesets: check that every PR left one. Add `.changeset/connect-docs.md` (`@kestack/connect: patch`, `@kestack/ai-toolkit: patch`) for the README rewrites.

**Verify**:

```sh
pnpm build && pnpm lint && pnpm test
grep -rn "ai-toolkit serve\|Machines Backend\|api-code\|\.ai-toolkit\|dev:local\|AUTH=local\|VITE_MACHINES_URL" --include='*.md' --include='*.ts' --include='*.tsx' apps toolkits docs README.md TODO.md | grep -v CHANGELOG   # only the moved-ADR notes and legacy.ts
```

### Order and parallel work

The order is P1 → P2 → P3 → P4, and each step needs the one before it. P2, P3 and P4 move shared files and edit the same `package.json` and laymos configs, so do not run them in parallel.

- **P5** may start once P2 is merged and run beside P3 or P4. It touches only `apps/connect/src/dev/**`, `apps/connect/docs/dev.md`, `apps/code/scripts/dev.ts` and the `dev` script line in `apps/code/package.json`, which P3 also edits. Rebase on whichever lands first.
- **P6** README drafts can start after P3. Finish them after P4, because P4 changes ai-toolkit's exports.

**Production rollout** happens when P2 merges. A push to `main` runs both `deploy-connect` and `deploy-code`, and Code's site then points at `connect.kishore.app`.

1. Make sure Connect prod (`connect.kishore.app`) deployed. Re-run `deploy-code` if it finished first.
2. Merge the changesets release PR, which publishes `@kestack/connect` and `@kestack/ai-toolkit`.
3. On each computer, stop `ai-toolkit serve` and run `npx @kestack/connect serve`. The first run moves `~/.ai-toolkit`.

Until step 3, prod Code lists no Machines. Later phases only change what a Machine runs, so each computer updates with the next `npx @kestack/connect serve`.

## Risks and open questions

Each one has a default the spec already uses.

1. **"Prefixed RPC groups" versus ai-toolkit ADR 0004.** ADR 0004 actually chose flat, verb-first names, unique across groups, merged into one group. Default: App Groups merge into one RpcGroup with flat names unique across every App Group, so Code's calls (`api.listFolder`) do not change. A second App Group must pick names that do not collide.
2. **Machine identity location.** Each branch is its own Machine, but config is shared across branches, so `machine.json` (0600) sits in the data folder, per branch. The config folder is resolved but nothing is written there until a user setting needs it.
3. **Attachments named by absolute path in old Raw records.** Default: move them and leave a symlink at `~/.ai-toolkit/attachments`. No records are rewritten.
4. **Speech to Text is shared.** Its folder is in the shared cache, so one switch covers production and every branch. Switching it off anywhere deletes the model for all. Accepted, since it is per computer anyway.
5. **Harness Binaries are kept by the `code` App Group's storage** (`AiHarnessConfig`). They become Machine-wide only when a second App Group needs them.
6. **Raw and Message keep the field `sessionId`.** It is persisted. In ai-toolkit it is documented as "the id of whoever keeps the Conversation".
7. **Code's deployed stages (prod, demo and `prN`) all use prod Cloud Connect**, where your Machines are. CORS allows `https://*.kishore.app`. A Connect PR preview is only for testing Cloud Connect itself.
8. **Removing `MachinesWorker` and `MachinesDatabaseV2` from Code's stack makes the next Code deploy delete them.** The old D1 goes with them, which is intended. Deploy Connect first. If alchemy refuses to delete the persistent D1 table, delete it by hand with `alchemy destroy` on the old resources. Old `ai-toolkit serve` Machines stop being listed until they switch.
9. **The detached supervisor runs `portless run alchemy dev` without a TTY.** Portless refuses to prompt with no TTY, for example when its proxy must start with sudo. Default: `ensureConnect` first checks `portless list` and, if the proxy is down, fails telling the user to run `portless proxy start`. If alchemy dev itself needs a TTY, the fallback is to run the supervisor attached to the first App's process group. Then Ctrl-C in that App stops Connect for everyone, which is documented in `docs/dev.md`.
10. **TLS to `*.kishore.computer` from Node** (`/auth` health checks, Machine sign-in) relies on `NODE_EXTRA_CA_CERTS` pointing at Portless's CA, which this shell already sets. `docs/dev.md` says to set it.
11. **The Auth Worker must accept the new device app name `ke-connect`, and cookie calls from `connect.kishore.app` and `[*.]connect.kishore.computer`.** Neither repo has an allowlist for this; check it on the first dev run. If it refuses, keep the app name `'ai-toolkit'`.
12. **Port `0`** needs the bound port read back from Effect's `HttpServer` (`HttpServer.addressWith` or the service's `address`) before `online` opens the tunnel. If the Node server Layer cannot expose it, pick a free port first, as `server.test.ts`'s `freePort` does, and pass it in.
13. **Kabuki "a parent never Sends to a Child".** The engine Sends to the `conversation` Child from outside the tree, which is allowed. The Session learns of changes only through `ConversationKeeper.stands`, a Request. `keep` and `stands` are called in order from the Conversation's Workers, so the record is never saved ahead of the Raw that explains it.
14. **The first `@kestack/connect` release** is published at the stack group's next version (0.0.3), skipping 0.0.1 and 0.0.2. That is expected with changesets' `fixed`.
