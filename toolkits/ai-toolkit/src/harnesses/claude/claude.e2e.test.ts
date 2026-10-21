import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { Duration, Effect, Exit, Fiber, Option, Scope, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  HarnessBinaries,
  type HarnessSession,
  type RawOut,
  type TurnInput,
} from '../../harness/index.js';
import type { Part, Projected } from '../../projection/index.js';
import type { Raw } from '../../raw/index.js';
import { claude } from './index.js';
import { restore } from './sdk-session/index.js';

/** Every message the Agent SDK's query yields, as the harness reads it. */
const sdkMessages = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('@anthropic-ai/claude-agent-sdk', async (importOriginal) => {
  const sdk =
    await importOriginal<typeof import('@anthropic-ai/claude-agent-sdk')>();
  const query: typeof sdk.query = (params) => {
    const live = sdk.query(params);
    const tee: typeof live = new Proxy(live, {
      get: (target, key) => {
        if (key === Symbol.asyncIterator) return () => tee;
        if (key === 'next') {
          return async (...args: []) => {
            const result = await target.next(...args);
            if (result.done !== true) {
              sdkMessages.push(
                JSON.parse(JSON.stringify(result.value)) as Record<
                  string,
                  unknown
                >,
              );
            }
            return result;
          };
        }
        const value: unknown = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return tee;
  };
  return { ...sdk, query };
});

/**
 * Runs the real local Claude Code. Opt in with AI_TOOLKIT_E2E=1; set
 * AI_TOOLKIT_CAPTURE=<dir> to also write every turn's records there as JSON
 * (the project fixtures were captured this way).
 */
const enabled = process.env['AI_TOOLKIT_E2E'] === '1';
const capture = process.env['AI_TOOLKIT_CAPTURE'];
const MODEL = process.env['AI_TOOLKIT_E2E_MODEL'] ?? 'claude-haiku-5-5';
const SECRET = 'PINEAPPLE-42';

const asRaw = (out: RawOut, index: number): Raw => ({
  id: String(index).padStart(6, '0'),
  sessionId: 'e2e',
  turnId: 'e2e',
  harness: 'claude',
  kind: out.kind,
  agentId: out.agentId ?? null,
  payload: out.payload,
  at: index,
});

const projectAll = (outs: ReadonlyArray<RawOut>): ReadonlyArray<Projected> =>
  outs.flatMap((out, i) => {
    const projected = claude.project(asRaw(out, i));
    return projected === null ? [] : [projected];
  });

const parts = (messages: ReadonlyArray<Projected>): ReadonlyArray<Part> =>
  messages.flatMap((m) => m.parts);

const toolCalls = (messages: ReadonlyArray<Projected>) =>
  parts(messages).flatMap((p) => (p.type === 'toolCall' ? [p] : []));

/** The answer's text, whole or streamed in chunks. */
const texts = (messages: ReadonlyArray<Projected>) =>
  parts(messages)
    .flatMap((p) =>
      p.type === 'text' || (p.type === 'textChunk' && p.channel === 'text')
        ? [p.text]
        : [],
    )
    .join('\n');

/**
 * Restores every stored assistant record from the turn's chunks and checks
 * it against what the SDK sent: nothing is lost, though no text is kept twice.
 */
const expectRestorable = (outs: ReadonlyArray<RawOut>) => {
  const chunks = new Map<string, string[]>();
  for (const out of outs) {
    if (out.kind !== 'text.chunk') continue;
    const { streamId, text } = out.payload as {
      streamId: string;
      text: string;
    };
    chunks.set(streamId, [...(chunks.get(streamId) ?? []), text]);
  }
  const stored = outs.filter((o) => o.kind === 'assistant');
  expect(stored.length).toBeGreaterThan(0);
  for (const out of stored) {
    const uuid = (out.payload as { uuid: string }).uuid;
    const original = sdkMessages.find((m) => m['uuid'] === uuid);
    expect(original).toBeDefined();
    expect(restore(out.payload, chunks)).toEqual(original);
  }
};

const lastTurnEnd = (messages: ReadonlyArray<Projected>) =>
  parts(messages)
    .flatMap((p) => (p.type === 'turnEnded' ? [p] : []))
    .at(-1);

const save = (name: string, outs: ReadonlyArray<RawOut>) => {
  if (capture !== undefined) {
    writeFileSync(join(capture, `${name}.json`), JSON.stringify(outs, null, 2));
  }
};

/**
 * Runs one turn, calling `during` once with the first record that matches
 * `when` (to steer or cancel mid-turn), and collects every record.
 */
const runTurn = (
  session: HarnessSession,
  text: string,
  options?: {
    readonly when: (out: RawOut) => boolean;
    readonly during: Effect.Effect<void, unknown>;
  },
  input?: Partial<TurnInput>,
) =>
  Effect.gen(function* () {
    const outs: RawOut[] = [];
    const forks: Array<Fiber.Fiber<void, unknown>> = [];
    yield* session.turn({ text, images: [], ...input }).pipe(
      Stream.runForEach((out) =>
        Effect.gen(function* () {
          outs.push(out);
          if (
            options !== undefined &&
            forks.length === 0 &&
            options.when(out)
          ) {
            forks.push(yield* Effect.forkChild(options.during));
          }
        }),
      ),
    );
    for (const fork of forks) yield* Fiber.join(fork);
    return outs;
  });

const hasToolCall = (name: string) => (out: RawOut) =>
  out.kind === 'assistant' &&
  JSON.stringify(out.payload).includes(`"name":"${name}"`);

describe.skipIf(!enabled)('claude harness against the real Claude Code', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-toolkit-claude-e2e-'));
  let scope: Scope.Closeable;
  let session: HarnessSession;
  const run = <A>(effect: Effect.Effect<A, unknown, HarnessBinaries>) =>
    Effect.runPromise(
      effect.pipe(Effect.provide(HarnessBinaries.layerDefault)),
    );

  beforeAll(async () => {
    writeFileSync(join(cwd, 'note.txt'), `The secret word is ${SECRET}.\n`);
    scope = await run(Scope.make());
    session = await run(
      claude
        .open({ cwd, model: MODEL, settings: { effort: 'low' } })
        .pipe(Scope.provide(scope)),
    );
  });

  afterAll(async () => {
    if (scope !== undefined) await run(Scope.close(scope, Exit.void));
  });

  it('lists the models this login can run by their full ids, one the default', async () => {
    const models = await run(claude.availableModels!);
    const ids = models.map((model) => model.id);
    expect(ids).toContain(MODEL);
    expect(ids).not.toContain('default');
    expect(models.filter((model) => model.isDefault)).toHaveLength(1);
  }, 60_000);

  it('reads a file: a Read tool call, its result, and a done turn', async () => {
    const outs = await run(
      runTurn(
        session,
        'Use the Read tool to read note.txt, then tell me the secret word.',
      ),
    );
    save('read', outs);
    const messages = projectAll(outs);
    const read = toolCalls(messages).find((c) => c.name === 'Read');
    expect(read?.tool).toBe('read');
    expect(read?.title).toContain('note.txt');
    const result = parts(messages).find(
      (p) => p.type === 'toolResult' && p.toolCallId === read?.id,
    );
    expect(result).toMatchObject({ isError: false });
    expect(JSON.stringify(result)).toContain(SECRET);
    expect(outs.at(-1)?.kind).toBe('result');
    expect(lastTurnEnd(messages)?.status).toBe('done');
    expect(await run(session.nativeId)).toBeTypeOf('string');
  }, 120_000);

  it('streams a long answer in chunks of a few sentences; the whole points at them', async () => {
    const outs = await run(
      runTurn(
        session,
        'Without using any tools, write about 8 sentences about octopuses ' +
          'as one paragraph.',
      ),
    );
    save('stream', outs);
    const messages = projectAll(outs);
    const chunks = parts(messages).flatMap((p) =>
      p.type === 'textChunk' && p.channel === 'text' ? [p] : [],
    );
    const streamIds = [...new Set(chunks.map((c) => c.streamId))];
    expect(streamIds).toHaveLength(1);
    expect(chunks.length).toBeGreaterThan(1);
    // The whole record comes after its chunks, holding a pointer to them.
    const wholeAt = outs.findIndex((o) =>
      JSON.stringify(o.payload).includes(`{"$stream":"${streamIds[0]}"}`),
    );
    expect(outs[wholeAt]?.kind).toBe('assistant');
    expect(outs.findLastIndex((o) => o.kind === 'text.chunk')).toBeLessThan(
      wholeAt,
    );
    // It shows no text twice: only the chunks show the answer.
    expect(parts(messages).some((p) => p.type === 'text')).toBe(false);
    const { uuid } = outs[wholeAt]!.payload as { uuid: string };
    const sent = sdkMessages.find((m) => m['uuid'] === uuid) as {
      message: { content: ReadonlyArray<{ text: string }> };
    };
    expect(sent.message.content[0]?.text.length).toBeGreaterThan(400);
    expect(chunks.map((c) => c.text).join('')).toBe(
      sent.message.content[0]?.text,
    );
    expectRestorable(outs);
    expect(outs.at(-1)?.kind).toBe('result');
  }, 120_000);

  it('runs a subagent whose records carry the spawning tool call id', async () => {
    const outs = await run(
      runTurn(
        session,
        'This is a test of nested subagents. Use the Agent tool, with ' +
          'run_in_background set to false, to start a general-purpose ' +
          'subagent, and give it exactly this task: "You must not read any ' +
          'file yourself. Your only allowed action is one call to the Agent ' +
          'tool, with run_in_background set to false, starting a ' +
          'general-purpose subagent that reads note.txt and reports the ' +
          'secret word. Report that word back." Then tell me the word.',
      ),
    );
    save('subagent', outs);
    expectRestorable(outs);
    const messages = projectAll(outs);
    const spawn = toolCalls(messages.filter((m) => m.agentId === null)).find(
      (c) => c.tool === 'subagent',
    );
    expect(spawn).toBeDefined();
    const children = messages.filter((m) => m.agentId === spawn?.id);
    expect(children.length).toBeGreaterThan(0);
    // The nested call is made by the first subagent, so it carries that
    // subagent's id. Claude Code streams only task_* frames for the nested
    // subagent's own work, not its messages, so it has no records here.
    const nested = toolCalls(children).find((c) => c.tool === 'subagent');
    expect(nested).toBeDefined();
    const nestedTask = outs.find(
      (o) =>
        o.kind === 'system/task_started' &&
        JSON.stringify(o.payload).includes(`"tool_use_id":"${nested?.id}"`),
    );
    expect(nestedTask).toBeDefined();
    expect(outs.at(-1)?.kind).toBe('result');
  }, 300_000);

  it('steers mid-turn: the steer joins the turn, which ends once', async () => {
    const outs = await run(
      runTurn(
        session,
        'Run the Bash command `sleep 5; echo one`, then reply with the word DONE.',
        {
          when: hasToolCall('Bash'),
          during: session.steer({
            text: 'Also, at the very end of your reply, add the word BANANA.',
            images: [],
          }),
        },
      ),
    );
    save('steer', outs);
    expectRestorable(outs);
    const messages = projectAll(outs);
    expect(texts(messages)).toContain('BANANA');
    expect(outs.at(-1)?.kind).toBe('result');
    expect(lastTurnEnd(messages)?.status).toBe('done');
  }, 120_000);

  it('cancels mid-turn, and the next turn still works', async () => {
    const started = Date.now();
    const outs = await run(
      runTurn(
        session,
        'Run the Bash command `sleep 60`, then reply with the word FINISHED.',
        { when: hasToolCall('Bash'), during: session.cancel },
      ),
    );
    save('cancel', outs);
    expect(Date.now() - started).toBeLessThan(45_000);
    const messages = projectAll(outs);
    expect(texts(messages)).not.toContain('FINISHED');
    const end = lastTurnEnd(messages);
    if (end !== undefined) expect(end.status).toBe('cancelled');

    const next = await run(
      runTurn(session, 'Reply with only the word OK. Do not use tools.'),
    );
    save('after-cancel', next);
    const after = projectAll(next);
    expect(texts(after)).toContain('OK');
    expect(lastTurnEnd(after)?.status).toBe('done');
  }, 180_000);

  it('resumes by nativeId in a fresh session', async () => {
    const nativeId = await run(session.nativeId);
    expect(nativeId).toBeTypeOf('string');
    const outs = await run(
      Effect.scoped(
        Effect.gen(function* () {
          const resumed = yield* claude.open({
            cwd,
            model: MODEL,
            settings: { effort: 'low' },
            ...(nativeId === undefined ? {} : { nativeId }),
          });
          const outs = yield* runTurn(
            resumed,
            'Without using any tools: what was the secret word in note.txt?',
          );
          expect(yield* resumed.nativeId).toBeTypeOf('string');
          return outs;
        }),
      ),
    );
    save('resume', outs);
    const messages = projectAll(outs);
    expect(toolCalls(messages)).toEqual([]);
    expect(texts(messages)).toContain(SECRET);
  }, 120_000);
});

/** A solid-color PNG, written by hand so the test needs no image library. */
const solidPng = (rgb: readonly [number, number, number], size = 32) => {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array(size).fill(rgb).flat()),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array(size).fill(row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
};

/** A session's JSONL transcript, as Claude Code keeps it. */
const transcript = (nativeId: string): string => {
  const projects = join(homedir(), '.claude', 'projects');
  const path = readdirSync(projects)
    .map((dir) => join(projects, dir, `${nativeId}.jsonl`))
    .find(existsSync);
  if (path === undefined) throw new Error(`No transcript for ${nativeId}`);
  return readFileSync(path, 'utf8');
};

const NO_TOOLS = 'Do not use any tools. ';

describe.skipIf(!enabled)(
  'claude agent features against the real Claude Code',
  () => {
    const cwd = mkdtempSync(join(tmpdir(), 'ai-toolkit-claude-e2e-features-'));
    const run = <A>(
      effect: Effect.Effect<A, unknown, HarnessBinaries | Scope.Scope>,
    ) =>
      Effect.runPromise(
        effect.pipe(
          Effect.scoped,
          Effect.provide(HarnessBinaries.layerDefault),
        ),
      );
    const open = (nativeId?: string) =>
      claude.open({
        cwd,
        model: MODEL,
        settings: { effort: 'low' },
        ...(nativeId === undefined ? {} : { nativeId }),
      });

    it('says which binary it runs and its version', async () => {
      const info = await run(claude.binary);
      expect(info).toMatchObject({ error: null, isDefault: true });
      expect(info.path).toBeTypeOf('string');
      expect(info.version).toMatch(/\d+\.\d+\.\d+/);
    }, 30_000);

    it('runs the configured binary, and says why a broken one cannot run', async () => {
      const info = await Effect.runPromise(
        claude.binary.pipe(
          Effect.provideService(HarnessBinaries, {
            path: () => Effect.succeed('/nowhere/claude'),
          }),
        ),
      );
      expect(info).toEqual({
        path: '/nowhere/claude',
        version: null,
        error: 'No file at /nowhere/claude',
        isDefault: false,
      });
    });

    it('lists the skills it offers in a folder, without a turn', async () => {
      const skills = await run(claude.skills(cwd));
      expect(skills.length).toBeGreaterThan(0);
      for (const skill of skills) {
        expect(skill.name).not.toMatch(/^\//);
        expect(skill.description).toBeTypeOf('string');
      }
      expect(skills.map((skill) => skill.name)).not.toContain('clear');
    }, 60_000);

    it('sees an image sent with the message', async () => {
      const outs = await run(
        Effect.gen(function* () {
          const session = yield* open();
          return yield* runTurn(
            session,
            NO_TOOLS +
              'What is the one color filling this image? Reply with one lowercase word.',
            undefined,
            {
              images: [
                {
                  name: 'swatch.png',
                  mime: 'image/png',
                  data: solidPng([220, 20, 20]),
                },
              ],
            },
          );
        }),
      );
      expect(texts(projectAll(outs)).toLowerCase()).toContain('red');
    }, 120_000);

    it('forks at a turn: the fork remembers before the fork point, not after', async () => {
      const { nativeId, forkPoint } = await run(
        Effect.gen(function* () {
          const session = yield* open();
          yield* runTurn(
            session,
            NO_TOOLS + 'Remember the first code word: ALPHA. Reply OK.',
          );
          const forkPoint = yield* session.lastTurnNativeId;
          yield* runTurn(
            session,
            NO_TOOLS + 'Remember the second code word: BRAVO. Reply OK.',
          );
          expect(yield* session.lastTurnNativeId).not.toBe(forkPoint);
          return { nativeId: yield* session.nativeId, forkPoint };
        }),
      );
      expect(forkPoint).toBeTypeOf('string');
      const forked = await run(
        claude.fork({ cwd, nativeId: nativeId!, at: forkPoint! }),
      );
      expect(forked.nativeId).not.toBe(nativeId);
      const outs = await run(
        Effect.gen(function* () {
          const session = yield* open(forked.nativeId);
          return yield* runTurn(
            session,
            NO_TOOLS +
              'List every code word I gave you, in capitals, and nothing else.',
          );
        }),
      );
      const answer = texts(projectAll(outs));
      expect(answer).toContain('ALPHA');
      expect(answer).not.toContain('BRAVO');

      // A fork of the fork may name a Fork Point from the original session.
      const again = await run(
        claude.fork({ cwd, nativeId: forked.nativeId, at: forkPoint! }),
      );
      expect(transcript(again.nativeId)).toContain('ALPHA');
      expect(transcript(again.nativeId)).not.toContain('BRAVO');
    }, 240_000);

    it('asks in text and in data, leaving the session’s transcript as it was', async () => {
      const nativeId = await run(
        Effect.gen(function* () {
          const session = yield* open();
          yield* runTurn(
            session,
            NO_TOOLS + 'My favourite fruit is MANGO. Reply OK.',
          );
          return (yield* session.nativeId)!;
        }),
      );
      const before = transcript(nativeId);
      const text = await run(
        claude.ask({
          cwd,
          nativeId,
          model: MODEL,
          question: 'What is my favourite fruit?',
        }),
      );
      expect(text._tag).toBe('Text');
      expect(text._tag === 'Text' && text.text.toUpperCase()).toContain(
        'MANGO',
      );
      const data = await run(
        claude.ask({
          cwd,
          nativeId,
          model: MODEL,
          question: 'What is my favourite fruit?',
          schema: {
            type: 'object',
            properties: { fruit: { type: 'string' } },
            required: ['fruit'],
          },
        }),
      );
      expect(data._tag).toBe('Data');
      expect(
        data._tag === 'Data' && JSON.stringify(data.data).toUpperCase(),
      ).toContain('MANGO');
      expect(transcript(nativeId)).toBe(before);
    }, 180_000);

    it('lists a background job, and stops it', async () => {
      const seen = await run(
        Effect.gen(function* () {
          const session = yield* open();
          expect(
            Option.getOrThrow(yield* Stream.runHead(session.backgroundJobs)),
          ).toEqual([]);
          const listed = yield* session.backgroundJobs.pipe(
            Stream.filter((jobs) => jobs.length > 0),
            Stream.runHead,
            Effect.forkChild,
          );
          yield* runTurn(
            session,
            'Run the Bash command `sleep 60` with run_in_background set to true. ' +
              'Do not wait for it; reply STARTED right away.',
          );
          const jobs = Option.getOrThrow(
            yield* Fiber.join(listed).pipe(
              Effect.timeout(Duration.seconds(30)),
            ),
          );
          expect(jobs).toHaveLength(1);
          expect(jobs[0]).toMatchObject({ kind: 'shell' });
          expect(jobs[0]?.startedAt).toBeTypeOf('number');
          const emptied = yield* session.backgroundJobs.pipe(
            Stream.filter((list) => list.length === 0),
            Stream.runHead,
            Effect.forkChild,
          );
          yield* session.stopBackgroundJob(jobs[0]!.id);
          yield* Fiber.join(emptied).pipe(Effect.timeout(Duration.seconds(30)));
          return jobs;
        }),
      );
      expect(seen[0]?.title).not.toBe('');
    }, 180_000);

    it('streams the turn the agent starts when a background job ends', async () => {
      const { user, agent } = await run(
        Effect.gen(function* () {
          const session = yield* open();
          const first = yield* session.agentTurns.pipe(
            Stream.runHead,
            Effect.forkChild,
          );
          const user = yield* runTurn(
            session,
            'Run the Bash command `sleep 15; echo FINISHED-JOB` with run_in_background ' +
              'set to true. Do not wait for it; reply STARTED right away. When it ' +
              'finishes, reply with its output.',
          );
          const turn = Option.getOrThrow(
            yield* Fiber.join(first).pipe(Effect.timeout(Duration.seconds(60))),
          );
          const agent = Array.from(yield* Stream.runCollect(turn));
          // The session is free for a user turn again.
          yield* runTurn(session, NO_TOOLS + 'Reply OK.');
          expect(yield* session.lastTurnNativeId).toBeTypeOf('string');
          return { user, agent };
        }),
      );
      expect(user.at(-1)?.kind).toBe('result');
      expect(agent[0]?.kind).toBe('system/task_notification');
      expect(agent.at(-1)?.kind).toBe('result');
      expect(agent.some((out) => out.kind === 'assistant')).toBe(true);
    }, 180_000);

    it('ends a user turn sent as a background job ends at its own result', async () => {
      const { user, agents } = await run(
        Effect.gen(function* () {
          const session = yield* open();
          const agents: RawOut[][] = [];
          yield* session.agentTurns.pipe(
            Stream.runForEach((turn) =>
              Stream.runCollect(turn).pipe(
                Effect.map((outs) => agents.push(Array.from(outs))),
              ),
            ),
            Effect.forkChild,
          );
          const ended = yield* session.backgroundJobs.pipe(
            Stream.dropWhile((jobs) => jobs.length === 0),
            Stream.filter((jobs) => jobs.length === 0),
            Stream.runHead,
            Effect.forkChild,
          );
          yield* runTurn(
            session,
            'Run the Bash command `sleep 6` with run_in_background set to ' +
              'true, then reply STARTED right away and end your turn.',
          );
          yield* Fiber.join(ended).pipe(Effect.timeout(Duration.seconds(60)));
          // Sent the moment the job ends: Claude Code takes the task
          // notification and this message together.
          const user = yield* runTurn(
            session,
            NO_TOOLS + 'Reply with the single word PINEAPPLE.',
          );
          yield* Effect.sleep(Duration.seconds(10));
          return { user, agents };
        }),
      );
      const ours = user.filter(
        (out) =>
          out.kind === 'result' &&
          JSON.stringify(out.payload).includes('user_message_uuids'),
      );
      expect(ours).toHaveLength(1);
      expect(user.at(-1)).toBe(ours[0]);
      expect(texts(projectAll(user))).toContain('PINEAPPLE');
      for (const turn of agents) {
        expect(texts(projectAll(turn))).not.toContain('PINEAPPLE');
      }
    }, 180_000);

    it('keeps a turn whole when it starts a background command and works on', async () => {
      const { user, agent } = await run(
        Effect.gen(function* () {
          const session = yield* open();
          const first = yield* session.agentTurns.pipe(
            Stream.runHead,
            Effect.forkChild,
          );
          const user = yield* runTurn(
            session,
            'Start the Bash command `sleep 20; echo BACKGROUND-DONE` with ' +
              'run_in_background set to true. Then, while it runs, run the ' +
              'Bash command `echo FOREGROUND-WORK` in the foreground. Then ' +
              'reply FINISHED. Do not wait for the background command.',
          );
          const turn = Option.getOrThrow(
            yield* Fiber.join(first).pipe(Effect.timeout(Duration.seconds(60))),
          );
          return { user, agent: Array.from(yield* Stream.runCollect(turn)) };
        }),
      );
      const messages = projectAll(user);
      const results = user.filter((out) => out.kind === 'result');
      expect(results).toHaveLength(1);
      expect(user.at(-1)?.kind).toBe('result');
      expect(
        toolCalls(messages).filter((call) => call.name === 'Bash'),
      ).toHaveLength(2);
      expect(JSON.stringify(user)).toContain('FOREGROUND-WORK');
      expect(texts(messages)).toContain('FINISHED');
      expect(lastTurnEnd(messages)?.usage?.outputTokens).toBeGreaterThan(0);
      // The agent's own turn comes only after the user turn's result, once
      // the background command ends.
      expect(agent[0]?.kind).toBe('system/task_notification');
      expect(agent.filter((out) => out.kind === 'result')).toHaveLength(1);
    }, 180_000);

    it('keeps what a background subagent writes after its turn ended', async () => {
      writeFileSync(join(cwd, 'note.txt'), `The secret word is ${SECRET}.\n`);
      const { user, agent } = await run(
        Effect.gen(function* () {
          const session = yield* open();
          const first = yield* session.agentTurns.pipe(
            Stream.runHead,
            Effect.forkChild,
          );
          const user = yield* runTurn(
            session,
            'Use the Agent tool with run_in_background set to true to start a ' +
              'general-purpose subagent that reads note.txt and reports the ' +
              'secret word. Reply STARTED right away and end your turn.',
          );
          const turn = Option.getOrThrow(
            yield* Fiber.join(first).pipe(Effect.timeout(Duration.seconds(90))),
          );
          return { user, agent: Array.from(yield* Stream.runCollect(turn)) };
        }),
      );
      const spawn = toolCalls(projectAll(user)).find(
        (call) => call.tool === 'subagent',
      );
      expect(spawn).toBeDefined();
      const all = [...user, ...agent];
      expect(all.some((out) => out.agentId === spawn?.id)).toBe(true);
      expect(
        all.some(
          (out) =>
            out.agentId === spawn?.id &&
            JSON.stringify(out.payload).includes(SECRET),
        ),
      ).toBe(true);
      expect(agent.at(-1)?.kind).toBe('result');
    }, 180_000);

    it('changes the model for a turn and the turns after it', async () => {
      const models = await run(claude.availableModels!);
      const other = models.find(
        (model) => model.id !== MODEL && model.id.includes('sonnet'),
      );
      expect(other).toBeDefined();
      const [changed, kept] = await run(
        Effect.gen(function* () {
          const session = yield* open();
          const changed = yield* runTurn(
            session,
            NO_TOOLS + 'Reply OK.',
            undefined,
            {
              model: other!.id,
              settings: { effort: 'low' },
            },
          );
          const kept = yield* runTurn(session, NO_TOOLS + 'Reply OK.');
          return [changed, kept];
        }),
      );
      const modelOf = (outs: ReadonlyArray<RawOut>) =>
        outs
          .filter((out) => out.kind === 'assistant')
          .map(
            (out) =>
              (out.payload as { message: { model: string } }).message.model,
          );
      expect(modelOf(changed)).toContain(other!.id);
      expect(modelOf(kept)).toContain(other!.id);
    }, 180_000);

    it('reports MCP server status and context usage', async () => {
      const { servers, usage } = await run(
        Effect.gen(function* () {
          const session = yield* open();
          yield* runTurn(session, NO_TOOLS + 'Reply OK.');
          return {
            servers: yield* session.mcpStatus,
            usage: yield* session.contextUsage,
          };
        }),
      );
      for (const server of servers) {
        expect(server.name).toBeTypeOf('string');
        expect([
          'connected',
          'failed',
          'needs-auth',
          'pending',
          'disabled',
        ]).toContain(server.status);
      }
      expect(usage.usedTokens).toBeGreaterThan(0);
      expect(usage.maxTokens).toBeGreaterThan(usage.usedTokens!);
      for (const limit of usage.rateLimits) {
        expect(limit.label).toBeTypeOf('string');
        expect(limit.usedPercent).toBeGreaterThanOrEqual(0);
      }
    }, 120_000);
  },
);
