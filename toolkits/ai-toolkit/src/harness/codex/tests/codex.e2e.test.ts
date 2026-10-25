import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Duration, Effect, Fiber, Layer, Stream, type Schema } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import {
  HarnessAccount,
  isRecord,
  OneShotPrompt,
  type Agent,
  type BackgroundJob,
  type RawOut,
  type TurnEnd,
  type TurnHandle,
  type TurnInput,
} from '../../contract/index.js';
import type { Part, Projected } from '../../../contract/projection/index.js';
import type { Raw } from '../../../contract/raw/index.js';
import { isNotification, start } from '../app-server/index.js';
import { codex, codexOneShot, restore } from '../index.js';
import { openSession } from '../thread/index.js';

// Runs against the real, logged-in Codex on this machine. A cheap, fast model.
const MODEL = 'gpt-5.6-luna';
const SETTINGS = { reasoningEffort: 'low' };
const TIMEOUT = 240_000;
/** Set to a folder to save every turn's records (fixtures for project.test.ts). */
const CAPTURE = process.env.AI_TOOLKIT_CAPTURE;

const cwd = mkdtempSync(join(tmpdir(), 'ai-toolkit-codex-e2e-'));
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

const toRaw = (out: RawOut, index: number): Raw => ({
  id: String(index).padStart(6, '0'),
  sessionId: 'session',
  turnId: 'turn',
  harness: 'codex',
  kind: out.kind,
  agentId: out.agentId ?? null,
  payload: out.payload,
  at: index,
});

const projectAll = (outs: ReadonlyArray<RawOut>): ReadonlyArray<Projected> =>
  outs.flatMap((out, index) => {
    const projected = codex.project(toRaw(out, index));
    return projected === null ? [] : [projected];
  });

const parts = (messages: ReadonlyArray<Projected>): ReadonlyArray<Part> =>
  messages.flatMap((message) => message.parts);

const ofType = <T extends Part['type']>(
  messages: ReadonlyArray<Projected>,
  type: T,
) =>
  parts(messages).filter(
    (part): part is Extract<Part, { type: T }> => part.type === type,
  );

const assistantText = (messages: ReadonlyArray<Projected>) =>
  messages
    .filter((message) => message.agentId === null)
    .flatMap((message) => message.parts)
    .flatMap((part) =>
      part.type === 'text' ||
      (part.type === 'textChunk' && part.channel === 'text')
        ? [part.text]
        : [],
    )
    .join('');

/** Each stream's chunk texts, in order, from a turn's records. */
const chunksOf = (outs: ReadonlyArray<RawOut>) => {
  const chunks: Record<string, Array<string>> = {};
  for (const out of outs)
    if (out.kind === 'text.chunk') {
      const { streamId, text } = out.payload as {
        streamId: string;
        text: string;
      };
      (chunks[streamId] ??= []).push(text);
    }
  return chunks;
};

/** One turn's records, the steers Codex took, and how the turn ended. */
const readTurn = (turn: TurnHandle, name: string) =>
  turn.out.pipe(
    Stream.runCollect,
    Effect.map((all) => {
      const outs: RawOut[] = [];
      const steered: string[] = [];
      let end: TurnEnd | undefined;
      for (const out of all)
        if (isRecord(out)) outs.push(out);
        else if (out._tag === 'TurnEnd') end = out;
        else steered.push(out.id);
      return { outs, steered, end };
    }),
    Effect.tap(({ outs }) =>
      Effect.sync(() => {
        if (CAPTURE !== undefined)
          writeFileSync(
            join(CAPTURE, `${name}.json`),
            JSON.stringify(outs, null, 2),
          );
      }),
    ),
  );

const open = (nativeId?: string) =>
  codex.open({
    cwd,
    model: MODEL,
    settings: SETTINGS,
    ...(nativeId === undefined ? {} : { nativeId }),
  });

const run = <A, E>(
  effect: Effect.Effect<A, E, import('effect').Scope.Scope | HarnessAccount>,
) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(HarnessAccount.layerDefault)),
  );

describe.runIf(process.env.AI_TOOLKIT_E2E === '1')(
  'codex harness (live)',
  () => {
    it(
      'runs a shell command, then resumes the thread in a fresh open',
      async () => {
        const nativeId = await run(
          Effect.gen(function* () {
            const session = yield* open();
            const outs = yield* collect(
              session,
              'Use your shell tool to run exactly `echo e2e-shell-ok`. Then create a file note.txt containing the word hi with your file editing tool (apply_patch), not the shell. Then reply with one word: done.',
              'shell',
            );
            const messages = projectAll(outs);
            const call = ofType(messages, 'toolCall').find(
              (part) => part.tool === 'bash',
            );
            expect(call?.title).toContain('echo e2e-shell-ok');
            const result = ofType(messages, 'toolResult').find(
              (part) => part.toolCallId === call?.id,
            );
            expect(result?.output).toContain('e2e-shell-ok');
            expect(result?.isError).toBe(false);
            const write = ofType(messages, 'toolCall').find(
              (part) => part.tool === 'write',
            );
            expect(write?.title).toContain('note.txt');
            expect(ofType(messages, 'turnEnded')).toEqual([
              { type: 'turnEnded', status: 'done' },
            ]);
            // The user's own text is the engine's record, never echoed back.
            expect(messages.some((message) => message.role === 'user')).toBe(
              false,
            );
            return yield* session.nativeId;
          }),
        );
        expect(nativeId).toBeTypeOf('string');

        await run(
          Effect.gen(function* () {
            const session = yield* open(nativeId);
            expect(yield* session.nativeId).toBe(nativeId);
            const outs = yield* collect(
              session,
              'What exact text did that shell command print? Reply with just that text, no tools.',
              'resume',
            );
            expect(assistantText(projectAll(outs))).toContain('e2e-shell-ok');
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'streams a long answer in chunks that restore every finished item exactly',
      async () => {
        await run(
          Effect.gen(function* () {
            // Its own server, to see each finished item as Codex sent it.
            const server = yield* start(cwd);
            const sent: Array<Schema.Json> = [];
            server.listen({
              notification: (notification) => {
                if (isNotification(notification, 'item/completed'))
                  sent.push(notification.params as unknown as Schema.Json);
              },
              exit: () => {},
            });
            const session = yield* openSession(server, {
              cwd,
              model: MODEL,
              sandbox: 'read-only',
              effort: 'low',
            });
            const outs = yield* collect(
              session,
              'Without using any tools, write eight full sentences, each about 30 words long, about how rivers shape valleys over time. Plain prose, one paragraph.',
              'stream',
            );
            const chunks = chunksOf(outs);
            const stored = outs.filter((out) => out.kind === 'item/completed');
            // Every stored item, restored from its chunks, is what Codex sent.
            expect(stored.map((out) => restore(out.payload, chunks))).toEqual(
              sent,
            );
            const answer = stored.findLast(
              (out) =>
                (out.payload as { item: { type: string } }).item.type ===
                'agentMessage',
            )!;
            // Raw holds the answer once: in its chunks, pointed to by the item.
            const { item } = answer.payload as {
              item: { id: string; text: unknown };
            };
            expect(item.text).toEqual({ $stream: item.id });
            expect(chunks[item.id]!.length).toBeGreaterThan(2);
            expect(chunks[item.id]!.join('').length).toBeGreaterThan(500);
            // Every chunk comes before the item, and the item projects to nothing.
            const at = outs.indexOf(answer);
            expect(
              outs
                .slice(at)
                .some(
                  (out) =>
                    out.kind === 'text.chunk' &&
                    (out.payload as { streamId: string }).streamId === item.id,
                ),
            ).toBe(false);
            expect(codex.project(toRaw(answer, at))).toBeNull();
            expect(assistantText(projectAll(outs))).toBe(
              chunks[item.id]!.join(''),
            );
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'tags every record of a sub-agent with the spawning call',
      async () => {
        await run(
          Effect.gen(function* () {
            const session = yield* open();
            const outs = yield* collect(
              session,
              'Spawn exactly one sub-agent with your spawn agent tool. Tell it to run the shell command `echo from-child` and report the output. Wait for it, then reply with what it reported.',
              'subagent',
            );
            const messages = projectAll(outs);
            const spawn = ofType(messages, 'toolCall').find(
              (part) => part.tool === 'subagent',
            );
            expect(spawn).toBeDefined();
            const child = messages.filter(
              (message) => message.agentId === spawn?.id,
            );
            expect(
              ofType(child, 'toolCall').some((part) => part.tool === 'bash'),
            ).toBe(true);
            expect(child.some((message) => message.role === 'user')).toBe(true);
            const result = ofType(messages, 'toolResult').find(
              (part) => part.toolCallId === spawn?.id,
            );
            expect(result?.output).toContain('from-child');
            // Only the main agent ends the turn.
            expect(ofType(messages, 'turnEnded')).toEqual([
              { type: 'turnEnded', status: 'done' },
            ]);
            expect(
              messages.filter((message) => message.agentId === null).length,
            ).toBeGreaterThan(0);
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'keeps the turn open until a sub-agent left running finishes',
      async () => {
        await run(
          Effect.gen(function* () {
            const session = yield* open();
            const outs = yield* collect(
              session,
              'Spawn exactly one sub-agent with your spawn agent tool and tell it to run the shell command `sleep 10 && echo late-child` and report the output. Do not wait for it: right after spawning, reply with the single word spawned and end your turn.',
              'subagent-outlives',
            );
            const messages = projectAll(outs);
            const spawn = ofType(messages, 'toolCall').find(
              (part) => part.tool === 'subagent',
            );
            const ended = messages.findIndex((message) =>
              message.parts.some((part) => part.type === 'turnEnded'),
            );
            const result = messages.findIndex((message) =>
              message.parts.some(
                (part) =>
                  part.type === 'toolResult' && part.toolCallId === spawn?.id,
              ),
            );
            expect(ended).toBeGreaterThanOrEqual(0);
            expect(result).toBeGreaterThan(ended);
            expect(
              ofType(messages.slice(result), 'toolResult')[0]?.output,
            ).toContain('late-child');
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'steers a running turn',
      async () => {
        await run(
          Effect.gen(function* () {
            const session = yield* open();
            const turn = session.turn({
              text: 'Use your shell tool to run `sleep 8 && echo slept`, then reply with its output.',
              images: [],
            });
            const fiber = yield* readTurn(turn, 'steer').pipe(Effect.forkChild);
            yield* Effect.sleep(Duration.seconds(4));
            yield* turn.steer('steer-1', {
              text: 'Also end your final reply with the word STEERED.',
              images: [],
            });
            const { outs, steered, end } = yield* Fiber.join(fiber);
            const messages = projectAll(outs);
            expect(assistantText(messages)).toContain('STEERED');
            expect(ofType(messages, 'turnEnded')).toEqual([
              { type: 'turnEnded', status: 'done' },
            ]);
            expect(steered).toEqual(['steer-1']);
            expect(end).toMatchObject({ status: 'done', shown: true });
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'cancels a running turn and stays usable',
      async () => {
        await run(
          Effect.gen(function* () {
            const session = yield* open();
            const fiber = yield* collect(
              session,
              'Use your shell tool to run `sleep 60`, then reply with: finished.',
              'cancel',
            ).pipe(Effect.forkChild);
            yield* Effect.sleep(Duration.seconds(6));
            yield* session.cancel;
            const cancelled = projectAll(yield* Fiber.join(fiber));
            expect(ofType(cancelled, 'turnEnded')).toEqual([
              { type: 'turnEnded', status: 'cancelled' },
            ]);

            const outs = yield* collect(
              session,
              'Reply with exactly: ok-after-cancel',
              'after-cancel',
            );
            const messages = projectAll(outs);
            expect(assistantText(messages)).toContain('ok-after-cancel');
            expect(ofType(messages, 'turnEnded')).toEqual([
              { type: 'turnEnded', status: 'done' },
            ]);
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'answers a One-shot Prompt',
      async () => {
        const reply = await Effect.runPromise(
          OneShotPrompt.use((oneShot) =>
            oneShot.prompt('Reply with exactly: ok-one-shot'),
          ).pipe(Effect.provide(codexOneShot)),
        );
        expect(reply).toContain('ok-one-shot');
      },
      TIMEOUT,
    );

    // This machine's ChatGPT account runs gpt-5.6-luna but not gpt-6.1-sol.
    it(
      'lists only the models this login can run, one of them the default',
      async () => {
        const models = await Effect.runPromise(
          codex.availableModels!.pipe(
            Effect.provide(HarnessAccount.layerDefault),
          ),
        );
        const ids = models.map((model) => model.id);
        expect(ids).toContain(MODEL);
        expect(ids).not.toContain('gpt-6.1-sol');
        expect(models.filter((model) => model.isDefault)).toHaveLength(1);
      },
      TIMEOUT,
    );

    it(
      "ends a turn on a model the login cannot run as failed, with the provider's message",
      async () => {
        const outs = await run(
          Effect.gen(function* () {
            const session = yield* codex.open({
              cwd,
              model: 'gpt-6.1-sol',
              settings: SETTINGS,
            });
            return yield* collect(
              session,
              'Reply with one word: hi.',
              'rejected',
            );
          }),
        );
        const ended = ofType(projectAll(outs), 'turnEnded');
        expect(ended).toHaveLength(1);
        expect(ended[0]?.status).toBe('failed');
        expect(ended[0]?.error).toMatch(
          /^The 'gpt-6\.1-sol' model is not supported/,
        );
      },
      TIMEOUT,
    );
  },
);

const collectAll = (
  session: Agent,
  text: string,
  name: string,
  more: Omit<TurnInput, 'text'> = { images: [] },
) => readTurn(session.turn({ text, ...more }), name);

const collect = (...args: Parameters<typeof collectAll>) =>
  Effect.map(collectAll(...args), ({ outs }) => outs);

/** A 32×32 PNG in one solid colour, base64. */
const solidPng = (rgb: readonly [number, number, number]): string => {
  const size = 32;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.from([
    0,
    ...Array.from({ length: size }, () => rgb).flat(),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk(
      'IDAT',
      deflateSync(Buffer.concat(Array.from({ length: size }, () => row))),
    ),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
};

/** The `codex` on PATH, which the default Harness Account runs. */
const installedCodex =
  (process.env['PATH'] ?? '')
    .split(delimiter)
    .map((dir) => join(dir, 'codex'))
    .find((path) => existsSync(path)) ?? '/nowhere/codex';

const account = (binary: string | undefined) =>
  Layer.succeed(HarnessAccount, { binary, configFolder: undefined });

/** Waits for the first Background Jobs snapshot that passes. */
const jobsUntil = (
  session: Agent,
  done: (jobs: ReadonlyArray<BackgroundJob>) => boolean,
) =>
  session.backgroundJobs.pipe(
    Stream.filter(done),
    Stream.runHead,
    Effect.timeout(Duration.seconds(45)),
  );

const SKILL = 'e2e-codeword';
const SKILL_WORD = 'PELICAN-7731';

describe.runIf(process.env.AI_TOOLKIT_E2E === '1')(
  'codex harness features (live)',
  () => {
    it(
      'sees an image sent with a turn',
      async () => {
        await run(
          Effect.gen(function* () {
            const session = yield* open();
            const outs = yield* collect(
              session,
              'What is the single colour that fills the attached image? Reply with one lowercase word, no tools.',
              'image',
              {
                images: [
                  {
                    name: 'red.png',
                    mime: 'image/png',
                    data: solidPng([220, 20, 20]),
                  },
                ],
              },
            );
            expect(assistantText(projectAll(outs)).toLowerCase()).toContain(
              'red',
            );
          }),
        );
      },
      TIMEOUT,
    );

    it(
      "lists a folder's skills and runs one named as /name",
      async () => {
        const folder = mkdtempSync(join(tmpdir(), 'ai-toolkit-codex-skill-'));
        mkdirSync(join(folder, '.agents', 'skills', SKILL), {
          recursive: true,
        });
        writeFileSync(
          join(folder, '.agents', 'skills', SKILL, 'SKILL.md'),
          [
            '---',
            `name: ${SKILL}`,
            'description: Answers with the e2e codeword.',
            '---',
            '',
            `When this skill is used, reply with exactly ${SKILL_WORD} and nothing else. Use no tools.`,
            '',
          ].join('\n'),
        );
        try {
          const skills = await run(codex.skills(folder));
          expect(skills).toContainEqual({
            name: SKILL,
            description: 'Answers with the e2e codeword.',
          });
          const outs = await run(
            Effect.gen(function* () {
              const session = yield* codex.open({
                cwd: folder,
                model: MODEL,
                settings: SETTINGS,
              });
              return yield* collect(session, `/${SKILL}`, 'skill');
            }),
          );
          const messages = projectAll(outs);
          expect(assistantText(messages)).toContain(SKILL_WORD);
          // The skill item hands Codex the skill: it never reads SKILL.md itself.
          expect(ofType(messages, 'toolCall')).toEqual([]);
        } finally {
          rmSync(folder, { recursive: true, force: true });
        }
      },
      TIMEOUT,
    );

    it(
      'forks at a finished turn: the fork remembers before it, not after',
      async () => {
        await run(
          Effect.gen(function* () {
            const session = yield* open();
            const first = (yield* collectAll(
              session,
              'Remember the codeword ALPHA-ONE. Reply with one word: noted. No tools.',
              'fork-1',
            )).end?.forkPoint;
            expect(first).toBeTypeOf('string');
            const second = (yield* collectAll(
              session,
              'Also remember the codeword BRAVO-TWO. Reply with one word: noted. No tools.',
              'fork-2',
            )).end?.forkPoint;
            expect(second).toBeTypeOf('string');
            expect(second).not.toBe(first);

            const nativeId = (yield* session.nativeId)!;
            const forked = yield* codex.fork({ cwd, nativeId, at: first! });
            expect(forked.nativeId).not.toBe(nativeId);
            const fork = yield* open(forked.nativeId);
            const answer = assistantText(
              projectAll(
                yield* collect(
                  fork,
                  'Which codewords have I asked you to remember? Reply with them comma separated, nothing else. No tools.',
                  'fork-3',
                ),
              ),
            );
            expect(answer).toContain('ALPHA-ONE');
            expect(answer).not.toContain('BRAVO-TWO');

            // Omitted `at` forks at the tip.
            const tip = yield* codex.fork({ cwd, nativeId });
            const tipAnswer = assistantText(
              projectAll(
                yield* collect(
                  yield* open(tip.nativeId),
                  'Which codewords have I asked you to remember? Reply with them comma separated, nothing else. No tools.',
                  'fork-4',
                ),
              ),
            );
            expect(tipAnswer).toContain('BRAVO-TWO');

            // A fork of the fork may name a Fork Point from the original thread.
            const again = yield* codex.fork({
              cwd,
              nativeId: tip.nativeId,
              at: first!,
            });
            const againAnswer = assistantText(
              projectAll(
                yield* collect(
                  yield* open(again.nativeId),
                  'Which codewords have I asked you to remember? Reply with them comma separated, nothing else. No tools.',
                  'fork-5',
                ),
              ),
            );
            expect(againAnswer).toContain('ALPHA-ONE');
            expect(againAnswer).not.toContain('BRAVO-TWO');
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'asks a session in text and in a schema, leaving it untouched',
      async () => {
        await run(
          Effect.gen(function* () {
            const session = yield* open();
            yield* collect(
              session,
              'Remember the codeword CHARLIE-3. Reply with one word: noted. No tools.',
              'ask-1',
            );
            const nativeId = (yield* session.nativeId)!;
            const text = yield* codex.ask({
              cwd,
              nativeId,
              model: MODEL,
              question:
                'What codeword did I tell you? Reply with just the codeword.',
            });
            expect(text._tag).toBe('Text');
            expect(text._tag === 'Text' && text.text).toContain('CHARLIE-3');

            const data = yield* codex.ask({
              cwd,
              nativeId,
              model: MODEL,
              question: 'What codeword did I tell you?',
              schema: {
                type: 'object',
                properties: { codeword: { type: 'string' } },
                required: ['codeword'],
                additionalProperties: false,
              },
            });
            expect(data).toEqual({
              _tag: 'Data',
              data: { codeword: 'CHARLIE-3' },
            });

            // The session's thread still has its one turn, on disk and live.
            const reader = yield* start(cwd);
            const turns = yield* reader.request('thread/turns/list', {
              threadId: nativeId,
              limit: 20,
            });
            expect(turns.data).toHaveLength(1);
            const after = assistantText(
              projectAll(
                yield* collect(
                  session,
                  'How many messages have I sent you before this one? Reply with just the number. No tools.',
                  'ask-2',
                ),
              ),
            );
            expect(after).toContain('1');
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'lists a background terminal, and stopping it removes it',
      async () => {
        await run(
          Effect.gen(function* () {
            const session = yield* open();
            const appeared = yield* jobsUntil(session, (jobs) =>
              jobs.some((job) => job.kind === 'shell'),
            ).pipe(Effect.forkChild);
            yield* collect(
              session,
              // A command still running when exec_command yields stays a
              // background terminal; `&` would detach it from Codex instead.
              'Call your exec_command tool once with cmd `sleep 45` (no `&`, no nohup) and yield_time_ms 1000, so the tool returns while the process keeps running in its session. Do not poll it, wait for it, write to it, or kill it. Then reply with one word: started.',
              'background',
            );
            const jobs = yield* Fiber.join(appeared);
            const shell =
              jobs._tag === 'Some'
                ? jobs.value.find((job) => job.kind === 'shell')
                : undefined;
            expect(shell?.title).toContain('sleep 45');
            expect(shell?.startedAt).toBeTypeOf('number');
            yield* session.stopBackgroundJob(shell!.id);
            const gone = yield* jobsUntil(
              session,
              (now) => !now.some((job) => job.id === shell!.id),
            );
            expect(gone._tag).toBe('Some');
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'changes model and settings for a turn and the ones after it',
      async () => {
        await run(
          Effect.gen(function* () {
            const server = yield* start(cwd);
            const settings: Array<{
              model: string;
              sandboxPolicy: { type: string };
            }> = [];
            server.listen({
              notification: (notification) => {
                if (notification.method === 'thread/settings/updated')
                  settings.push(
                    (
                      notification.params as {
                        threadSettings: (typeof settings)[number];
                      }
                    ).threadSettings,
                  );
              },
              exit: () => {},
            });
            const session = yield* openSession(server, {
              cwd,
              model: MODEL,
              sandbox: 'danger-full-access',
              effort: 'low',
            });
            yield* collect(
              session,
              'Reply with one word: one. No tools.',
              'model-1',
            );
            const outs = yield* collect(
              session,
              'Reply with one word: two. No tools.',
              'model-2',
              {
                images: [],
                model: 'gpt-5.6-terra',
                settings: { reasoningEffort: 'low', sandbox: 'read-only' },
              },
            );
            expect(ofType(projectAll(outs), 'turnEnded')).toEqual([
              { type: 'turnEnded', status: 'done' },
            ]);
            expect(settings.at(-1)?.model).toBe('gpt-5.6-terra');
            expect(settings.at(-1)?.sandboxPolicy.type).toBe('readOnly');
          }),
        );
      },
      TIMEOUT,
    );

    it(
      'reports MCP server status and context usage',
      async () => {
        await run(
          Effect.gen(function* () {
            const session = yield* open();
            yield* collect(
              session,
              'Reply with one word: hi. No tools.',
              'usage',
            );
            const servers = yield* session.mcpStatus;
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
            const usage = yield* session.contextUsage;
            expect(usage.usedTokens).toBeGreaterThan(0);
            expect(usage.maxTokens).toBeGreaterThan(usage.usedTokens!);
            expect(usage.rateLimits.length).toBeGreaterThan(0);
            for (const limit of usage.rateLimits) {
              expect(limit.label).toBeTypeOf('string');
              expect(limit.usedPercent).toBeGreaterThanOrEqual(0);
            }
            process.stderr.write(
              `USAGE ${JSON.stringify({ servers, usage })}\n`,
            );
          }),
        );
      },
      TIMEOUT,
    );

    it.runIf(existsSync(installedCodex))(
      'runs a configured Harness Binary, and says when one cannot run',
      async () => {
        const configured = await Effect.runPromise(
          codex.binary.pipe(Effect.provide(account(installedCodex))),
        );
        expect(configured).toMatchObject({
          path: installedCodex,
          error: null,
          isDefault: false,
        });
        expect(configured.version).toMatch(/^codex-cli \d+\.\d+\.\d+/);
        const installed = await Effect.runPromise(
          codex.binary.pipe(Effect.provide(account(undefined))),
        );
        expect(installed).toMatchObject({
          path: 'codex',
          version: configured.version,
          error: null,
          isDefault: true,
        });
        const missing = await Effect.runPromise(
          codex.binary.pipe(Effect.provide(account('/nowhere/codex'))),
        );
        expect(missing).toEqual({
          path: '/nowhere/codex',
          version: null,
          error: 'No file at /nowhere/codex',
          isDefault: false,
        });

        const outs = await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const session = yield* open();
              return yield* collect(
                session,
                'Reply with exactly: native-ok',
                'native',
              );
            }),
          ).pipe(Effect.provide(account(installedCodex))),
        );
        expect(assistantText(projectAll(outs))).toContain('native-ok');
      },
      TIMEOUT,
    );
  },
);
