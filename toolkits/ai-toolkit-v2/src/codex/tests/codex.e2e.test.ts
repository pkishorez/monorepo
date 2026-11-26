import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Fiber, Layer, Stream } from 'effect';
import {
  Codex,
  type CodexError,
  type Out,
  type TurnInput,
} from '../contract/index.ts';
import type { Answers, Recording, Step } from '../fake/index.ts';
import * as CodexReal from '../real/index.ts';
import { Driver } from '../shared/index.ts';
import { generate, protocolFile } from './protocol.ts';

const e2e = process.env['AI_TOOLKIT_V2_E2E'] === '1';
const recordings = join(import.meta.dirname, '..', 'fake', 'recordings');
const cwd = e2e ? realpathSync(mkdtempSync(join(tmpdir(), 'codex-e2e-'))) : '';
const answers: Record<string, unknown> = {};

const scrub = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value)
      .replaceAll(cwd, '/tmp/codex-e2e')
      .replaceAll(homedir(), '/home/user')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, 'user@example.com')
      .replace(
        /"(\w*accountId)":"[^"]*"/gi,
        '"$1":"00000000-0000-0000-0000-000000000000"',
      ),
  ) as unknown;

const save = (name: string, value: unknown) => {
  const file = join(recordings, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(scrub(value), null, 2)}\n`);
  execFileSync('npx', ['vp', 'fmt', file]);
};

const record = (outs: ReadonlyArray<Out>): Recording => {
  const started = outs.find((out) => out._tag === 'Started');
  const ended = outs.find((out) => out._tag === 'Ended');
  const messages = outs.flatMap((out): ReadonlyArray<Step> => {
    if (out._tag === 'Record') return [out.record];
    if (out._tag === 'Requested') return [out.request];
    if (out._tag === 'Steered') return [out.message];
    return [];
  });
  return {
    thread: started?._tag === 'Started' ? started.id : '',
    turn: ended?._tag === 'Ended' ? (ended.at ?? '') : '',
    messages,
  };
};

const ended = (outs: ReadonlyArray<Out>) => {
  const last = outs.at(-1);
  if (last?._tag !== 'Ended')
    throw new Error(`Run did not end: ${JSON.stringify(last)}`);
  return last;
};

const text = (value: string) => [
  { type: 'text' as const, text: value, text_elements: [] },
];

const layer = Layer.mergeAll(
  CodexReal.layer({ linger: '2 seconds' }),
  CodexReal.driver(),
);

describe.runIf(e2e)('Codex on the real codex app-server', () => {
  let model = '';
  const turn = (prompt: string, extra: Partial<TurnInput> = {}): TurnInput => ({
    input: text(prompt),
    model,
    effort: 'low',
    ...extra,
  });
  const thread = {
    cwd,
    approvalPolicy: 'never' as const,
    sandbox: 'read-only' as const,
  };
  let first = { id: '', at: '' };

  it.live('keeps the generated protocol current', () =>
    Effect.sync(() =>
      expect(readFileSync(protocolFile, 'utf8')).toBe(generate()),
    ),
  );

  it.live(
    'lists models and picks the cheapest',
    () =>
      Effect.gen(function* () {
        const codex = yield* Codex;
        const models = yield* codex.models({});
        answers['model/list'] = models;
        const cheap =
          models.data.find((each) =>
            /affordable|fast|mini/i.test(each.description),
          ) ?? models.data[0];
        model = cheap?.id ?? '';
        expect(model).not.toBe('');
        const driver = yield* Driver;
        const connection = yield* driver.start(cwd);
        answers['thread/start'] = yield* connection.request('thread/start', {
          cwd,
          ephemeral: true,
        });
      }).pipe(Effect.scoped, Effect.provide(layer)),
    60_000,
  );

  it.live(
    'creates a thread, sends to it live, resumes it, and forks it',
    () =>
      Effect.gen(function* () {
        const codex = yield* Codex;
        const created = yield* Stream.runCollect(
          codex.create({
            thread,
            turn: turn('Reply with the single word: one'),
          }),
        );
        save('create', record(created));
        expect(created[0]?._tag).toBe('Started');
        const end = ended(created);
        expect(end.status).toBe('completed');
        expect(end.result?.toLowerCase()).toContain('one');
        first = {
          id: created[0]?._tag === 'Started' ? created[0].id : '',
          at: end.at ?? '',
        };

        const live = yield* codex.live;
        expect(live.map((each) => each.id)).toContain(first.id);
        const sent = yield* Stream.runCollect(
          codex.send({
            id: first.id,
            turn: turn('Reply with the single word: two'),
          }),
        );
        expect(ended(sent).status).toBe('completed');

        yield* Effect.sleep('3 seconds');
        expect(yield* codex.live).toEqual([]);
        const resumed = yield* Stream.runCollect(
          codex.send({
            id: first.id,
            thread,
            turn: turn('Reply with the single word: three'),
          }),
        );
        expect(ended(resumed).result?.toLowerCase()).toContain('three');

        const forked = yield* Stream.runCollect(
          codex.fork({
            id: first.id,
            thread: { ...thread, lastTurnId: first.at },
            turn: turn(
              'Which single word did you reply with last? Reply with it only.',
            ),
          }),
        );
        const forkedId = forked[0]?._tag === 'Started' ? forked[0].id : '';
        expect(forkedId).not.toBe(first.id);
        expect(ended(forked).result?.toLowerCase()).toContain('one');
      }).pipe(Effect.provide(layer)),
    180_000,
  );

  it.live(
    'steers a Run in progress with a steer send',
    () =>
      Effect.gen(function* () {
        const codex = yield* Codex;
        const outs: Array<Out> = [];
        let joined: Fiber.Fiber<ReadonlyArray<Out>, CodexError> | undefined;
        yield* codex
          .create({
            thread,
            turn: turn(
              'Run `sleep 5 && echo slept` in the shell, then reply with its output.',
            ),
          })
          .pipe(
            Stream.runForEach((out) =>
              Effect.gen(function* () {
                outs.push(out);
                if (
                  joined !== undefined ||
                  out._tag !== 'Record' ||
                  out.record.method !== 'turn/started'
                )
                  return;
                const id = outs[0]?._tag === 'Started' ? outs[0].id : '';
                joined = yield* Stream.runCollect(
                  codex.send({
                    id,
                    turn: turn('Also end your reply with the word STEERED.'),
                    mode: 'steer',
                  }),
                ).pipe(Effect.forkChild);
              }),
            ),
          );
        save('steer', record(outs));
        expect(outs.some((out) => out._tag === 'Steered')).toBe(true);
        expect(ended(outs).result).toContain('STEERED');
        if (joined === undefined) throw new Error('No steer sent');
        const steer = yield* Fiber.join(joined);
        expect(steer).toEqual(outs);
      }).pipe(Effect.provide(layer)),
    120_000,
  );

  it.live(
    'asks for an approval and goes on once answered',
    () =>
      Effect.gen(function* () {
        const codex = yield* Codex;
        const outs: Array<Out> = [];
        yield* codex
          .create({
            thread: { cwd, approvalPolicy: 'untrusted', sandbox: 'read-only' },
            turn: turn('Run `touch made.txt` in the shell, then reply done.'),
          })
          .pipe(
            Stream.runForEach((out) =>
              Effect.gen(function* () {
                outs.push(out);
                if (out._tag !== 'Requested') return;
                const id = outs[0]?._tag === 'Started' ? outs[0].id : '';
                const live = yield* codex.live;
                expect(
                  live.find((each) => each.id === id)?.requests,
                ).toContainEqual(out.request);
                const decision =
                  out.request.method === 'execCommandApproval' ||
                  out.request.method === 'applyPatchApproval'
                    ? 'approved'
                    : 'accept';
                yield* codex.respond(id, out.request.id, { decision } as never);
              }),
            ),
          );
        save('approval', record(outs));
        expect(outs.some((out) => out._tag === 'Requested')).toBe(true);
        expect(ended(outs).status).toBe('completed');
      }).pipe(Effect.provide(layer)),
    120_000,
  );

  it.live(
    'cancels a Run in progress',
    () =>
      Effect.gen(function* () {
        const codex = yield* Codex;
        const outs: Array<Out> = [];
        let cancelled = false;
        yield* codex
          .create({
            thread,
            turn: turn('Run `sleep 30` in the shell, then reply done.'),
          })
          .pipe(
            Stream.runForEach((out) =>
              Effect.gen(function* () {
                outs.push(out);
                if (
                  cancelled ||
                  out._tag !== 'Record' ||
                  out.record.method !== 'item/started'
                )
                  return;
                if (out.record.params.item.type !== 'commandExecution') return;
                cancelled = true;
                yield* Effect.forkDetach(
                  codex.cancel(outs[0]?._tag === 'Started' ? outs[0].id : ''),
                );
              }),
            ),
          );
        save('cancel', record(outs));
        expect(ended(outs).status).toBe('cancelled');
      }).pipe(Effect.provide(layer)),
    120_000,
  );

  it.live(
    'answers with structured output',
    () =>
      Effect.gen(function* () {
        const codex = yield* Codex;
        const outs = yield* Stream.runCollect(
          codex.create({
            thread,
            turn: turn('Give the answer ok.', {
              outputSchema: {
                type: 'object',
                properties: { answer: { type: 'string' } },
                required: ['answer'],
                additionalProperties: false,
              },
            }),
          }),
        );
        save('structured', record(outs));
        expect(JSON.parse(ended(outs).result ?? '{}')).toEqual({
          answer: 'ok',
        });
      }).pipe(Effect.provide(layer)),
    120_000,
  );

  it.live(
    'answers each harness-specific method',
    () =>
      Effect.gen(function* () {
        const codex = yield* Codex;
        const account = yield* codex.account();
        answers['account/read'] = { ...account, workspaceRouting: null };
        answers['account/rateLimits/read'] = yield* codex.rateLimits();
        answers['account/usage/read'] = yield* codex.usage();
        const threads = yield* codex.threads({ cwd, limit: 2 });
        answers['thread/list'] = threads;
        expect(threads.data.length).toBeGreaterThan(0);
        const read = yield* codex.read({ threadId: first.id });
        answers['thread/read'] = read;
        expect(read.thread.id).toBe(first.id);
        const skills = yield* codex.skills({ cwds: [cwd] });
        answers['skills/list'] = {
          data: skills.data.map((entry) => ({
            ...entry,
            skills: entry.skills.slice(0, 2),
          })),
        };
        const mcp = yield* codex.mcpStatus({
          limit: 2,
          detail: 'toolsAndAuthOnly',
        });
        answers['mcpServerStatus/list'] = {
          ...mcp,
          data: mcp.data.map((server) => ({
            ...server,
            tools: {},
            toolListMeta: null,
          })),
        };
        const config = yield* codex.config({ cwd });
        answers['config/read'] = {
          config: { model: config.config.model },
          origins: {},
          layers: null,
        };

        yield* Stream.runDrain(
          codex.send({
            id: first.id,
            thread,
            turn: turn('Reply with the single word: four'),
          }),
        );
        yield* codex.compact(first.id);
        expect(yield* Effect.flip(codex.compact('not-live'))).toMatchObject({
          _tag: 'NotLive',
        });
        save('answers', answers satisfies Record<string, unknown> as Answers);
      }).pipe(Effect.provide(layer)),
    180_000,
  );

  it.live('cleans up', () =>
    Effect.sync(() => rmSync(cwd, { recursive: true, force: true })),
  );
});
