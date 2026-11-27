# @kestack/ai-toolkit-v2

Coding agent harnesses as Effect Services, each true to its own harness: Claude Code, Codex, OpenCode, Antigravity and any ACP agent, with one live instance per session and a fake for each

## Big picture

Each Coding Harness has its own SDK or protocol, its own records and its own idea of a session. This package does not put one shape over them. It gives each harness as its own Effect Service, typed in that harness's words, so nothing the harness can do is out of reach. What is common to them, if anything, is the business of whoever uses them, such as the code plugin.

Every Service has the same few verbs where its harness can do them: `create`, `fork` and `send` stream a Run, first `Started` with the harness's native id and last `Ended`; `send` queues behind the Run in progress, or with `mode: 'steer'` joins it where the harness steers; `respond` and `cancel` reach the live instance; `watch` and `live` show it. The native id is the only id. A router keeps at most one live instance per id, starts one on demand and lets it go after `linger`. The rest of each Service is what that harness alone can answer: context usage, rate limits, models, past sessions and more. The package keeps nothing on disk.

The source is grouped by kind: every harness lives under `src/harness/` and is exported under `./harness/*`, so other kinds, such as speech, can sit beside it later. The harness folders share no code and import nothing from each other. The rules they follow are in [docs/contract.md](docs/contract.md).

## Install

```sh
pnpm add @kestack/ai-toolkit-v2 effect
```

- `effect`: every Service, Stream and error is an Effect value. The package is built on Effect 4.1.

Install and sign in to the harnesses you use: `claude`, `codex`, `agy`, or any other ACP agent. OpenCode runs in-process through `@opencode/sdk`. Node 24 or newer.

## Exports

Each harness is one Service in three subpaths: the Service and its errors, `/real` for the Layer over the real harness, and `/fake` for the Layer over recordings. ACP gives the Service's type instead of a tag, so an app declares one tag per ACP agent and makes its Layer with `layer(tag, options)`. Their tables are in each harness's README.

| Subpath                                                                                                                  | What it does                                              |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| [`./harness/claude`](src/harness/claude/README.md), `./harness/claude/real`, `./harness/claude/fake`                     | Claude Code through the Claude Agent SDK.                 |
| [`./harness/codex`](src/harness/codex/README.md), `./harness/codex/real`, `./harness/codex/fake`                         | Codex through `codex app-server`.                         |
| [`./harness/opencode`](src/harness/opencode/README.md), `./harness/opencode/real`, `./harness/opencode/fake`             | OpenCode v2, hosted in-process by `@opencode/sdk/effect`. |
| [`./harness/antigravity`](src/harness/antigravity/README.md), `./harness/antigravity/real`, `./harness/antigravity/fake` | Antigravity through `agy acp`, with its own extensions.   |
| [`./harness/acp`](src/harness/acp/README.md), `./harness/acp/real`, `./harness/acp/fake`                                 | Any Agent Client Protocol agent, one tag per agent.       |

## Usage

### Hand a Claude session over to Codex

A fork of a Claude session, kept nowhere, summarizes it as data, and a new Codex session carries on from the summary. Trimmed from `src/harness/tests/handoff.e2e.test.ts`.

```ts
import { Effect, Layer, Stream } from 'effect';
import { Claude } from '@kestack/ai-toolkit-v2/harness/claude';
import * as ClaudeReal from '@kestack/ai-toolkit-v2/harness/claude/real';
import { Codex } from '@kestack/ai-toolkit-v2/harness/codex';
import * as CodexReal from '@kestack/ai-toolkit-v2/harness/codex/real';

const handoff = (claudeId: string, cwd: string) =>
  Effect.gen(function* () {
    const claude = yield* Claude;
    const codex = yield* Codex;
    const outs = yield* Stream.runCollect(
      claude.fork({
        id: claudeId,
        cwd,
        prompt: 'Summarize this conversation for another agent.',
        options: {
          persistSession: false,
          outputFormat: { type: 'json_schema', schema: summarySchema },
        },
      }),
    );
    const summary = structuredSummary(outs);
    return codex.create({
      thread: { cwd },
      turn: { input: [{ type: 'text', text: summary, text_elements: [] }] },
    });
  }).pipe(
    Effect.provide(Layer.mergeAll(ClaudeReal.layer(), CodexReal.layer())),
  );
```

- Each Service streams its own records: Claude's `SDKMessage`, Codex's app-server notifications. Only data crosses between them.
- `fork` and `create` both start with `Started`, so the new native id is known before any reply.
- A second `send` to the same id while its instance is live goes to that instance; after `linger` it resumes instead.
