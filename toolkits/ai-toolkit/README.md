# @kestack/ai-toolkit

Effect-native Coding Harnesses as plain Effects: Claude Code and Codex Agents in a folder, their Turns, Forks, Asks and One-shot Prompts, and the Messages projected from their Raw records; and Speech to Text on the computer

## Big picture

Claude Code and Codex each have their own SDK, their own records and their own idea of a session. ai-toolkit puts one contract over both, running the Claude Code and Codex the user installed, as one of their logins (a Harness Account): open an Agent in a folder, run and steer its Turns, cancel one, answer the Agent Questions it asks while a Turn runs, fork it after a finished Turn, ask it a question that leaves it untouched, and read every whole record it emits as Raw, projected into one Message form. It keeps nothing and serves nothing, and it offers plain Effects, not Actors: what is kept of an Agent, and how its Turns are ordered, is the business of whoever uses it. [`@kestack/connect`](../../apps/connect/README.md) is the first user: its `code` Plugin keeps each Agent as a Session.

Speech to Text sits behind a door of its own and knows nothing of Agents. When it is switched on, it downloads its runtime and model into a folder the caller names, and turns audio into text on the computer.

`/harness` and `/speech` hold only what runs in a browser too: the contract, the Services a program asks for, and their errors. What starts processes or reads files and the environment (Claude Code, Codex, the catalog's checks, the models.dev copy, sherpa-onnx) is behind `/harness/node` and `/speech/node`, so a browser build, or a test, gives the same Services from fakes.

The words are in [CONTEXT.md](CONTEXT.md). Raw records and their projection to Messages are in [docs/v1-spec.md](docs/v1-spec.md), and how a Turn's stream carries its facts in [docs/turn-flow.md](docs/turn-flow.md). The one Kabuki tree left, behind Speech to Text, is in [docs/kabuki-tree.md](docs/kabuki-tree.md). Decisions are in [docs/adr/](docs/adr/); 0011 (Fork Points are Turn ends), 0012 (Background Jobs are live, and agents may start Turns), 0013 (A Turn's facts travel in its stream), 0017 (Speech to Text runs on the Machine) and 0019 (The harnesses run what the user installed) are current here. 0004, 0014, 0015, 0016 and 0018 moved to [Connect's ADRs](../../apps/connect/docs/adr/), and the rest record a design that was replaced.

## Install

```sh
pnpm add @kestack/ai-toolkit effect @kestack/kabuki @kestack/std-toolkit
```

- `effect`: every harness call, Schema and error is an Effect value.
- `@kestack/kabuki`: Speech to Text runs its model as a private Actor, and `harness/fake` and `speech/fake` are made with its `Fake.make`.
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
| `AgentQuestionSchema`    | Schema of an Agent Question: its id, its one to four Items, and when it was asked.                           |
| `QuestionItemSchema`     | Schema of one Item of an Agent Question: header, question, options, and whether to multi-select or type.     |
| `QuestionOptionSchema`   | Schema of one option of a Question Item: its label and what choosing it means.                               |
| `QuestionAnswerSchema`   | Schema of the answer to an Agent Question: by Item id, the labels chosen, then any typed text.               |
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

| Export                        | What it does                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `Harnesses`                   | Service listing the Coding Harnesses a program runs, each found by name.                     |
| `harnesses`                   | Layer of `Harnesses` from a list of harnesses.                                               |
| `HarnessAccount`              | Service saying which Harness Account a call runs as: its binary and config folder.           |
| `HarnessAccount.layerDefault` | Layer running the installed harness from PATH, on its own config folder.                     |
| `binaryAt`                    | What a harness's binary resolves to, run as a given Harness Account.                         |
| `HarnessHost`                 | Service saying whether a Harness Binary runs and which config folder an account really uses. |
| `InvalidBinary`               | Error: the path is missing, not executable, or its `--version` failed.                       |
| `OneShotPrompt`               | Service answering a prompt with no Agent behind it and nothing kept.                         |
| `HarnessError`                | Error: a Coding Harness failed.                                                              |
| `isRecord`                    | Whether something in a Turn's stream is a record of the agent's, not a fact about the Turn.  |
| `projectRaw`                  | One Raw record to its Message form, by the harness in a list that wrote it.                  |
| `Models`                      | Service listing the Language Models each harness can run, from models.dev and the account.   |
| `ModelsError`                 | Error: the models could not be listed.                                                       |

### `@kestack/ai-toolkit/harness/node`

| Export             | What it does                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `claude`           | The Claude Code harness, through the Agent SDK.                                                 |
| `codex`            | The Codex harness, through `codex app-server`.                                                  |
| `codexOneShot`     | Layer of `OneShotPrompt` answered by Codex on a small model, read-only, in a temp folder.       |
| `checkBinary`      | A path the user gave, expanded, once it runs as the harness's binary.                           |
| `configFolderOf`   | The config folder an account really uses: its own, else the environment's, else the harness's.  |
| `harnessHostLayer` | Layer of `HarnessHost` on this computer: it runs binaries and reads the environment.            |
| `modelsLayer`      | Layer of `Models` from models.dev and the account, keeping its copy in a file the caller names. |

### `@kestack/ai-toolkit/harness/fake`

| Export            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`           | The Agent fake, for `FakeWorld.make` (`@kestack/kabuki/fake`): Claude Code and Codex installed and signed in under the home it is given, each reply replaying a recorded Turn at the pace it is given; its state shows the Agents open, each on its model and settings, and the replies running, its control `ReplyWith` pins the recording replies replay, and its Layer gives `Harnesses`, `OneShotPrompt`, `HarnessHost` and `Models`. |
| `makeFakeHarness` | A fake `claude` harness for tests, driven Turn by Turn, with a fake One-shot Prompt.                                                                                                                                                                                                                                                                                                                                                      |
| `FAKE_SKILLS`     | The Skills the fake harness offers.                                                                                                                                                                                                                                                                                                                                                                                                       |

### `@kestack/ai-toolkit/speech`

| Export                 | What it does                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `Speech`               | Service switching Speech to Text on and off, watching how it stands, and transcribing. |
| `SpeechToText`         | Service a model runs behind: install, load and transcribe.                             |
| `SpeechToTextNotReady` | Error: Speech to Text is off, still downloading, or failed.                            |
| `TranscriptionFailed`  | Error: the model would not load, or could not make out the audio.                      |

### `@kestack/ai-toolkit/speech/node`

| Export        | What it does                                                                |
| ------------- | --------------------------------------------------------------------------- |
| `speechLayer` | Layer of `Speech`, keeping its wish and model in a folder the caller names. |
| `sherpa`      | Layer of `SpeechToText` on sherpa-onnx with Parakeet.                       |

### `@kestack/ai-toolkit/speech/fake`

| Export           | What it does                                                                                                                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `speech`         | The Speech fake, for `FakeWorld.make` (`@kestack/kabuki/fake`): Speech to Text on a computer, its state the wish, the model on disk and what it hears; it downloads by itself, its control `Hear` says what every Take turns into, and its Layer gives `Speech`, the real speech model and Takes over it. |
| `makeFakeSpeech` | A fake `SpeechToText` for tests, its download held or failed on cue.                                                                                                                                                                                                                                      |

## Usage

### Open an Agent and run a Turn

`open` gives an Agent for as long as its Scope. A Turn is asked for with `turn`, and runs as its `out` is read: the agent's records, each steer where it joined, then the Turn's end. Shaped after `src/harness/codex/tests/codex.e2e.test.ts`.

```ts
import { Effect, Stream } from 'effect';
import { HarnessAccount, isRecord } from '@kestack/ai-toolkit/harness';
import { claude } from '@kestack/ai-toolkit/harness/node';

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
import { OneShotPrompt } from '@kestack/ai-toolkit/harness';
import { codexOneShot } from '@kestack/ai-toolkit/harness/node';

const reply = OneShotPrompt.use((oneShot) =>
  oneShot.prompt('Write a title of at most six words for: add dark mode'),
).pipe(Effect.provide(codexOneShot));
```

- It runs read-only, with no tools, on a small model, and keeps nothing; it fails after 30 seconds.

### Turn speech into text

`speechLayer` runs Speech to Text from a folder until its Scope closes. Trimmed from `src/speech/tests/speech.test.ts`.

```ts
import { Context, Effect, Layer } from 'effect';
import { Speech } from '@kestack/ai-toolkit/speech';
import { sherpa, speechLayer } from '@kestack/ai-toolkit/speech/node';

const program = Effect.scoped(
  Effect.gen(function* () {
    const context = yield* Layer.build(
      speechLayer({ folder: '/path/to/speech-to-text' }).pipe(
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
