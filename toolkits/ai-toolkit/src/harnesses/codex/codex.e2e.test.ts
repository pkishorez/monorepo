import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duration, Effect, Fiber, Stream, type Schema } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import {
  HarnessBinaries,
  Titler,
  type HarnessSession,
  type RawOut,
} from '../../harness/index.js';
import type { Part, Projected } from '../../projection/index.js';
import type { Raw } from '../../raw/index.js';
import { isNotification, start } from './app-server/index.js';
import { codex, codexTitler, restore } from './index.js';
import { openSession } from './thread/index.js';

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

const collect = (session: HarnessSession, text: string, name: string) =>
  session.turn({ text, images: [] }).pipe(
    Stream.runCollect,
    Effect.map((outs) => [...outs]),
    Effect.tap((outs) =>
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
  effect: Effect.Effect<A, E, import('effect').Scope.Scope | HarnessBinaries>,
) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(HarnessBinaries.layerDefault)),
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
            const fiber = yield* collect(
              session,
              'Use your shell tool to run `sleep 8 && echo slept`, then reply with its output.',
              'steer',
            ).pipe(Effect.forkChild);
            yield* Effect.sleep(Duration.seconds(4));
            yield* session.steer({
              text: 'Also end your final reply with the word STEERED.',
              images: [],
            });
            const messages = projectAll(yield* Fiber.join(fiber));
            expect(assistantText(messages)).toContain('STEERED');
            expect(ofType(messages, 'turnEnded')).toEqual([
              { type: 'turnEnded', status: 'done' },
            ]);
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
      'titles a session',
      async () => {
        const title = await Effect.runPromise(
          Titler.use((titler) =>
            titler.title([
              'Please add dark mode to the settings page of my React app, with a toggle.',
            ]),
          ).pipe(Effect.provide(codexTitler)),
        );
        expect(title.length).toBeGreaterThan(0);
        expect(title.split(' ').length).toBeLessThanOrEqual(6);
      },
      TIMEOUT,
    );

    // This machine's ChatGPT account runs gpt-5.6-luna but not gpt-6.1-sol.
    it(
      'lists only the models this login can run, one of them the default',
      async () => {
        const models = await Effect.runPromise(
          codex.availableModels!.pipe(
            Effect.provide(HarnessBinaries.layerDefault),
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
