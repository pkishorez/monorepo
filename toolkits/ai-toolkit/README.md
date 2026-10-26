# @kestack/ai-toolkit

Effect-native Coding Harnesses as plain Effects: Claude Code and Codex Agents in a folder, their Turns, Forks, Asks and One-shot Prompts, and the Messages projected from their Raw records; and Speech to Text on the computer

## Big picture

Claude Code and Codex each have their own SDK, their own records and their own idea of a session. ai-toolkit puts one contract over both, running the Claude Code and Codex the user installed, as one of their logins (a Harness Account): open an Agent in a folder, run and steer its Turns, cancel one, fork it after a finished Turn, ask it a question that leaves it untouched, and read every whole record it emits as Raw, projected into one Message form. It keeps nothing and serves nothing, and it offers plain Effects, not Actors: what is kept of an Agent, and how its Turns are ordered, is the business of whoever uses it. [`@kestack/connect`](../../apps/connect/README.md) is the first user: its `code` App Group keeps each Agent as a Session.

Speech to Text sits behind a door of its own and knows nothing of Agents. When it is switched on, it downloads its runtime and model into a folder the caller names, and turns audio into text on the computer.

The words are in [CONTEXT.md](CONTEXT.md). Raw records and their projection to Messages are in [docs/v1-spec.md](docs/v1-spec.md), and how a Turn's stream carries its facts in [docs/turn-flow.md](docs/turn-flow.md). The one Kabuki tree left, behind Speech to Text, is in [docs/kabuki-tree.md](docs/kabuki-tree.md). Decisions are in [docs/adr/](docs/adr/); 0011 (Fork Points are Turn ends), 0012 (Background Jobs are live, and agents may start Turns), 0013 (A Turn's facts travel in its stream), 0017 (Speech to Text runs on the Machine) and 0019 (The harnesses run what the user installed) are current here. 0004, 0014, 0015, 0016 and 0018 moved to [Connect's ADRs](../../apps/connect/docs/adr/), and the rest record a design that was replaced.

## Install

```sh
pnpm add @kestack/ai-toolkit effect @kestack/kabuki @kestack/std-toolkit
```

- `effect`: every harness call, Schema and error is an Effect value.
- `@kestack/kabuki`: Speech to Text runs its model as a private Actor.
- `@kestack/std-toolkit`: the entity Schemas of Raw and Message.

Claude Code and Codex are not dependencies: install the ones you use, and sign in (`claude auth login`, `codex login`). The Claude Agent SDK's JavaScript ships inside `dist/vendor`, under Anthropic's license; Speech to Text's runtime, `sherpa-onnx-node`, is fetched from the npm registry when it is switched on. Node 24 or newer is required, and a `tar` that reads gzip and bzip2 to unpack Speech to Text's files.

## Exports

### `@kestack/ai-toolkit/contract`

| Export                   | What it does                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `RawSchema`              | Entity schema of one whole record a harness, or its caller, wrote for a Turn.                                |
| `JsonSchema`             | Schema of any JSON value, as a Raw payload holds it.                                                         |
| `HARNESS_NAMES`          | Tuple of Coding Harness names: `claude`, `codex`.                                                            |
| `RAW_SOURCES`            | Tuple of who may write a Raw record: a harness, or `engine` for its caller.                                  |
| `MessageSchema`          | Entity schema of a Message, the projected form a client reads.                                               |
| `PartSchema`             | Schema of one Message part: text, thinking, tool call, attachment, turn start or end, and more.              |
| `UsageSchema`            | Schema of the tokens a Message's Turn used.                                                                  |
| `PROJECTION_VERSION`     | The version of the projection from Raw to Message; a change means projecting again.                          |
| `ROLES`                  | Tuple of Message roles.                                                                                      |
| `TOOL_KINDS`             | Tuple of the kinds a tool call is drawn as.                                                                  |
| `TURN_END_STATUSES`      | Tuple of how a Turn ends: `done`, `cancelled`, `failed`, `interrupted`.                                      |
| `AttachmentSchema`       | Schema of an Attachment: name, mime type, and base64 data.                                                   |
| `AskAnswerSchema`        | Schema of an Ask's answer: `Text`, or `Data` shaped by the given JSON Schema.                                |
| `BackgroundJobSchema`    | Schema of one Background Job.                                                                                |
| `BACKGROUND_JOB_KINDS`   | Tuple of Background Job kinds: `shell`, `agent`.                                                             |
| `BinaryInfoSchema`       | Schema of a resolved Harness Binary: its path and what `--version` printed.                                  |
| `ConfigFolderInfoSchema` | Schema of the config folder an account really uses, and whether its own, the environment's or the harness's. |
| `ContextUsageSchema`     | Schema of Context Usage: tokens used, the window size, and rate limits.                                      |
| `RateLimitSchema`        | Schema of one rate limit in Context Usage.                                                                   |
| `McpServerStatusSchema`  | Schema of one MCP server an Agent is connected to.                                                           |
| `MCP_SERVER_STATES`      | Tuple of MCP server states, such as `connected`, `failed`, `needs-auth`, `pending`.                          |
| `ModelInfo`              | Schema of one Language Model: id, name, and release date.                                                    |
| `SkillSchema`            | Schema of a Skill: name, description, and an optional argument hint.                                         |

### `@kestack/ai-toolkit/harness`

| Export                        | What it does                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `claude`                      | The Claude Code harness, through the Agent SDK.                                                |
| `codex`                       | The Codex harness, through `codex app-server`.                                                 |
| `codexOneShot`                | Layer of `OneShotPrompt` answered by Codex on a small model, read-only, in a temp folder.      |
| `Harnesses`                   | Service listing the Coding Harnesses a program runs, each found by name.                       |
| `harnesses`                   | Layer of `Harnesses` from a list of harnesses.                                                 |
| `HarnessAccount`              | Service saying which Harness Account a call runs as: its binary and config folder.             |
| `HarnessAccount.layerDefault` | Layer running the installed harness from PATH, on its own config folder.                       |
| `binaryAt`                    | What a harness's binary resolves to, run as a given Harness Account.                           |
| `checkBinary`                 | A path the user gave, expanded, once it runs as the harness's binary.                          |
| `configFolderOf`              | The config folder an account really uses: its own, else the environment's, else the harness's. |
| `InvalidBinary`               | Error: the path is missing, not executable, or its `--version` failed.                         |
| `OneShotPrompt`               | Service answering a prompt with no Agent behind it and nothing kept.                           |
| `HarnessError`                | Error: a Coding Harness failed.                                                                |
| `isRecord`                    | Whether something in a Turn's stream is a record of the agent's, not a fact about the Turn.    |
| `projectRaw`                  | One Raw record to its Message form, by the harness in a list that wrote it.                    |
| `Models`                      | Service listing the Language Models each harness can run, from models.dev and the account.     |
| `Models.layer`                | Layer of `Models`, keeping its models.dev copy in a file the caller names.                     |
| `ModelsError`                 | Error: the models could not be listed.                                                         |

### `@kestack/ai-toolkit/harness/fake`

| Export            | What it does                                                                           |
| ----------------- | -------------------------------------------------------------------------------------- |
| `makeFakeHarness` | A fake `claude` harness for tests, scripted Turn by Turn, with a fake One-shot Prompt. |
| `FAKE_SKILLS`     | The Skills the fake harness offers.                                                    |

### `@kestack/ai-toolkit/speech`

| Export                 | What it does                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `Speech`               | Service switching Speech to Text on and off, watching how it stands, and transcribing. |
| `Speech.layer`         | Layer of `Speech`, keeping its wish and model in a folder the caller names.            |
| `SpeechToText`         | Service a model runs behind: install, load and transcribe.                             |
| `sherpa`               | Layer of `SpeechToText` on sherpa-onnx with Parakeet.                                  |
| `SpeechToTextNotReady` | Error: Speech to Text is off, still downloading, or failed.                            |
| `TranscriptionFailed`  | Error: the model would not load, or could not make out the audio.                      |

### `@kestack/ai-toolkit/speech/fake`

| Export             | What it does                                                         |
| ------------------ | -------------------------------------------------------------------- |
| `makeFakeSpeech`   | A fake `SpeechToText` for tests, its download held or failed on cue. |
| `FAKE_MODEL_BYTES` | How many bytes the fake model's download reports.                    |

## Usage

### Open an Agent and run a Turn

`open` gives an Agent for as long as its Scope. A Turn is asked for with `turn`, and runs as its `out` is read: the agent's records, each steer where it joined, then the Turn's end. Shaped after `src/harness/codex/tests/codex.e2e.test.ts`.

```ts
import { Effect, Stream } from 'effect';
import { claude, HarnessAccount, isRecord } from '@kestack/ai-toolkit/harness';

const program = Effect.scoped(
  Effect.gen(function* () {
    const agent = yield* claude.open({
      cwd: '/path/to/folder',
      model: 'claude-opus-5-5',
      settings: {},
    });
    const turn = agent.turn({ text: 'Say hi', images: [] });
    const outs = yield* Stream.runCollect(turn.out);
    const records = outs.filter(isRecord);
    return { nativeId: yield* agent.nativeId, records };
  }),
).pipe(Effect.provide(HarnessAccount.layerDefault));
```

- Each record is a `RawOut`; stamp it with ids and keep it as `Raw`, then `projectRaw([claude, codex])` turns it into a Message.
- `turn.steer(id, input)` hands a message to the running Turn; a steer whose `TurnSteered` never comes was not taken, and the caller runs it as the next Turn.
- Open again with `nativeId` to resume the Agent's context. `claude.fork` and `claude.ask` read it without opening it.
- Give `HarnessAccount` a `configFolder` to run as another login, such as `{ binary: undefined, configFolder: '~/.claude-work' }` for a second Claude; its context is resumed, forked and asked as that same account. With none, it runs in the process's environment: `configFolderOf('claude', undefined)` says which folder that is, `CLAUDE_CONFIG_DIR` or `CODEX_HOME` when set there, else `~/.claude` or `~/.codex`.

### Ask a One-shot Prompt

`OneShotPrompt` answers a prompt with no Agent behind it. `codexOneShot` is Codex's; tests give `makeFakeHarness().layer`.

```ts
import { Effect } from 'effect';
import { codexOneShot, OneShotPrompt } from '@kestack/ai-toolkit/harness';

const reply = OneShotPrompt.use((oneShot) =>
  oneShot.prompt('Write a title of at most six words for: add dark mode'),
).pipe(Effect.provide(codexOneShot));
```

- It runs read-only, with no tools, on a small model, and keeps nothing; it fails after 30 seconds.

### Turn speech into text

`Speech.layer` runs Speech to Text from a folder until its Scope closes. Trimmed from `src/speech/tests/speech.test.ts`.

```ts
import { Context, Effect, Layer } from 'effect';
import { sherpa, Speech } from '@kestack/ai-toolkit/speech';

const program = Effect.scoped(
  Effect.gen(function* () {
    const context = yield* Layer.build(
      Speech.layer({ folder: '/path/to/speech-to-text' }).pipe(
        Layer.provide(sherpa()),
      ),
    );
    const speech = Context.get(context, Speech);
    yield* speech.enable;
    // Once `speech.watch` says Ready:
    return yield* speech.transcribe(pcm);
  }),
);
```

- `enable` keeps the wish at once and downloads the runtime, then the model, after; `disable` deletes the folder, both with it.
- `transcribe` takes 16 kHz mono PCM, each sample 16-bit signed little-endian, and fails `SpeechToTextNotReady` unless Ready.
