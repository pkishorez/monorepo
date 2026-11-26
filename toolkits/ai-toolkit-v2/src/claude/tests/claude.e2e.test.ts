import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, layer } from '@effect/vitest';
import { Effect, Fiber, Stream } from 'effect';
import { Claude, type ClaudeOptions, type Live } from '../contract/index.js';
import type { Answers, Recording, RecordingEntry } from '../fake/index.js';
import * as ClaudeReal from '../real/index.js';
import { Out } from '../shared/index.js';

const e2e = process.env['AI_TOOLKIT_V2_E2E'] === '1';
const RECORDINGS = join(import.meta.dirname, '..', 'fake', 'recordings');
const TIMEOUT = 120_000;
const cwd = e2e
  ? realpathSync(mkdtempSync(join(tmpdir(), 'ai-toolkit-v2-claude-')))
  : '';
const options: ClaudeOptions = {
  model: 'haiku',
  settingSources: [],
  strictMcpConfig: true,
};
const bypass: ClaudeOptions = {
  ...options,
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
};
const ids: Array<string> = [];

const sanitize = (value: unknown): string =>
  JSON.stringify(value, null, 2)
    .replaceAll(cwd, '/tmp/ai-toolkit-v2-claude')
    .replaceAll(homedir(), '/Users/me');

const save = (name: string, outs: ReadonlyArray<Out>) => {
  const recording: Recording = {
    name,
    entries: outs.flatMap((out): ReadonlyArray<RecordingEntry> => {
      if (out._tag === 'Record') return [{ message: out.record }];
      if (out._tag === 'Requested') return [{ request: out.request }];
      return [];
    }),
  };
  writeFileSync(join(RECORDINGS, `${name}.json`), `${sanitize(recording)}\n`);
};

const startedId = (outs: ReadonlyArray<Out>): string => {
  const first = outs[0];
  if (first?._tag !== 'Started') throw new Error('No Started first');
  ids.push(first.id);
  return first.id;
};

const ended = (outs: ReadonlyArray<Out>) => {
  const last = outs.at(-1);
  if (last?._tag !== 'Ended') throw new Error('No Ended last');
  return last;
};

const resultText = (outs: ReadonlyArray<Out>): string => {
  const result = ended(outs).result;
  return result?.subtype === 'success' ? result.result : '';
};

const usesTool = (out: Out): boolean =>
  out._tag === 'Record' &&
  out.record.type === 'assistant' &&
  out.record.message.content.some((block) => block.type === 'tool_use');

const collect = (stream: Stream.Stream<Out, unknown>) =>
  Effect.map(Stream.runCollect(stream), (outs) => [...outs]);

const fruit = { id: '', at: '' };

describe.runIf(e2e)('Claude against the real claude', () => {
  afterAll(() => {
    rmSync(cwd, { recursive: true, force: true });
    execFileSync('npx', ['vp', 'fmt', RECORDINGS]);
  });

  layer(ClaudeReal.layer({ linger: '60 seconds' }), {
    excludeTestServices: true,
  })((it) => {
    it.effect(
      'create starts a session and runs its first Run',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          const outs = yield* collect(
            claude.create({
              cwd,
              prompt: 'Reply with only the word: apple',
              options,
            }),
          );
          fruit.id = startedId(outs);
          fruit.at = ended(outs).at ?? '';
          expect(ended(outs).status).toBe('completed');
          expect(resultText(outs).toLowerCase()).toContain('apple');
          expect(
            outs.some(
              (out) =>
                out._tag === 'Record' && out.record.session_id === fruit.id,
            ),
          ).toBe(true);
          save('create', outs);
        }),
      TIMEOUT,
    );

    it.effect(
      'send goes to the live instance',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          const before = yield* claude.live;
          expect(before.map((one: Live) => one.id)).toContain(fruit.id);
          const outs = yield* collect(
            claude.send({
              id: fruit.id,
              cwd,
              prompt: 'Reply with only the word: pear',
              options,
            }),
          );
          expect(outs[0]).toEqual(Out.Started({ id: fruit.id }));
          expect(ended(outs).status).toBe('completed');
          expect(resultText(outs).toLowerCase()).toContain('pear');
          save('send', outs);
        }),
      TIMEOUT,
    );

    it.effect(
      'answers the harness-specific methods',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          const initialization = yield* claude.initialization({
            cwd,
            options,
          });
          expect(initialization.models.length).toBeGreaterThan(0);
          expect(initialization.commands.length).toBeGreaterThan(0);
          const contextUsage = yield* claude.contextUsage(fruit.id);
          expect(contextUsage.totalTokens).toBeGreaterThan(0);
          const mcpServerStatus = yield* claude.mcpServerStatus(fruit.id);
          yield* claude.setModel(fruit.id, 'haiku');
          yield* claude.setPermissionMode(fruit.id, 'default');
          yield* claude.applyFlagSettings(fruit.id, {});
          const live = yield* claude.live;
          expect(
            live.find((one) => one.id === fruit.id)?.rateLimit,
          ).toBeDefined();
          const listed = yield* claude.listSessions({ dir: cwd });
          expect(listed.map((one) => one.sessionId)).toContain(fruit.id);
          const info = yield* claude.sessionInfo(fruit.id, { dir: cwd });
          expect(info?.sessionId).toBe(fruit.id);
          const messages = yield* claude.sessionMessages(fruit.id, {
            dir: cwd,
          });
          expect(messages.map((message) => message.uuid)).toContain(fruit.at);
          expect(yield* claude.listSubagents(fruit.id, { dir: cwd })).toEqual(
            [],
          );
          expect(
            yield* claude.subagentMessages(fruit.id, 'none', { dir: cwd }),
          ).toEqual([]);
          yield* claude.renameSession(fruit.id, 'fruit', { dir: cwd });
          yield* claude.tagSession(fruit.id, 'e2e', { dir: cwd });
          const renamed = yield* claude.sessionInfo(fruit.id, { dir: cwd });
          expect(renamed?.customTitle).toBe('fruit');
          const answers: Answers = {
            initialization: {
              ...initialization,
              account: { email: 'user@example.com', subscriptionType: 'max' },
            },
            contextUsage,
            mcpServerStatus,
          };
          writeFileSync(
            join(RECORDINGS, 'answers.json'),
            `${sanitize(answers)}\n`,
          );
        }),
      TIMEOUT,
    );

    it.effect(
      'fork starts a new session from a point of another',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          const outs = yield* collect(
            claude.fork({
              id: fruit.id,
              at: fruit.at,
              cwd,
              prompt:
                'Which words have you replied with so far? Reply with only those words.',
              options,
            }),
          );
          const id = startedId(outs);
          expect(id).not.toBe(fruit.id);
          expect(ended(outs).status).toBe('completed');
          expect(resultText(outs).toLowerCase()).toContain('apple');
          expect(resultText(outs).toLowerCase()).not.toContain('pear');
          expect(
            outs.every(
              (out) => out._tag !== 'Record' || out.record.session_id === id,
            ),
          ).toBe(true);
          save('fork', outs);
        }),
      TIMEOUT,
    );

    it.effect(
      'a steer joins the Run in progress and is echoed where Claude took it',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          let id = '';
          let steering: Fiber.Fiber<Array<Out>, unknown> | undefined;
          const outs = yield* collect(
            claude
              .create({
                cwd,
                prompt:
                  'Use the Bash tool to run exactly `sleep 3; echo one`. Then reply with only the output.',
                options: bypass,
              })
              .pipe(
                Stream.tap((out) => {
                  if (out._tag === 'Started') id = out.id;
                  if (steering !== undefined || !usesTool(out))
                    return Effect.void;
                  return collect(
                    claude.send({
                      id,
                      cwd,
                      prompt: 'Also end your reply with the word BANANA.',
                      mode: 'steer',
                    }),
                  ).pipe(
                    Effect.forkChild,
                    Effect.map((fiber) => {
                      steering = fiber;
                    }),
                  );
                }),
              ),
          );
          ids.push(id);
          const joined =
            steering === undefined ? [] : yield* Fiber.join(steering);
          const steer = outs.findIndex((out) => out._tag === 'Steered');
          const toolResult = outs.findIndex(
            (out) =>
              out._tag === 'Record' &&
              out.record.type === 'user' &&
              Array.isArray(out.record.message.content) &&
              out.record.message.content.some(
                (block) => block.type === 'tool_result',
              ),
          );
          expect(steer).toBeGreaterThan(toolResult);
          expect(joined).toEqual(outs);
          expect(ended(outs).status).toBe('completed');
          expect(resultText(outs)).toContain('BANANA');
          expect(ended(outs).result?.user_message_uuids).toHaveLength(2);
          save('steer', outs);

          const idle = yield* collect(
            claude.send({
              id,
              cwd,
              prompt: 'Reply with only the word KIWI.',
              mode: 'steer',
            }),
          );
          expect(
            idle.map((out) => out._tag).filter((tag) => tag !== 'Record'),
          ).toEqual(['Started', 'Ended']);
          expect(resultText(idle)).toContain('KIWI');
        }),
      TIMEOUT,
    );

    it.effect(
      'a permission request waits for respond',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          let id = '';
          const outs = yield* collect(
            claude
              .create({
                cwd,
                prompt:
                  'Use the Write tool to create the file note.txt containing: hi. Then reply with only: done',
                options,
              })
              .pipe(
                Stream.tap((out) => {
                  if (out._tag === 'Started') id = out.id;
                  if (out._tag !== 'Requested') return Effect.void;
                  return claude.respond(id, out.request.options.requestId, {
                    behavior: 'allow',
                    updatedInput: out.request.input,
                  });
                }),
              ),
          );
          ids.push(id);
          const requested = outs.flatMap((out) =>
            out._tag === 'Requested' ? [out.request] : [],
          );
          expect(requested.map((request) => request.toolName)).toEqual([
            'Write',
          ]);
          expect(ended(outs).status).toBe('completed');
          expect(existsSync(join(cwd, 'note.txt'))).toBe(true);
          save('permission', outs);
        }),
      TIMEOUT,
    );

    it.effect(
      'AskUserQuestion is a request answered through updatedInput',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          let id = '';
          const outs = yield* collect(
            claude
              .create({
                cwd,
                prompt:
                  'Use the AskUserQuestion tool once to ask me to pick red or blue. Then reply with only my pick.',
                options,
              })
              .pipe(
                Stream.tap((out) => {
                  if (out._tag === 'Started') id = out.id;
                  if (out._tag !== 'Requested') return Effect.void;
                  const questions = out.request.input['questions'];
                  const first: unknown = Array.isArray(questions)
                    ? questions[0]
                    : undefined;
                  const question =
                    typeof first === 'object' &&
                    first !== null &&
                    'question' in first &&
                    typeof first.question === 'string'
                      ? first.question
                      : '';
                  return claude.respond(id, out.request.options.requestId, {
                    behavior: 'allow',
                    updatedInput: {
                      ...out.request.input,
                      answers: { [question]: 'blue' },
                    },
                  });
                }),
              ),
          );
          ids.push(id);
          expect(
            outs.some(
              (out) =>
                out._tag === 'Requested' &&
                out.request.toolName === 'AskUserQuestion',
            ),
          ).toBe(true);
          expect(ended(outs).status).toBe('completed');
          expect(resultText(outs).toLowerCase()).toContain('blue');
          save('question', outs);
        }),
      TIMEOUT,
    );

    it.effect(
      'cancel stops the Run in progress',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          let id = '';
          let cancelled = false;
          const outs = yield* collect(
            claude
              .create({
                cwd,
                prompt: 'Use the Bash tool to run exactly `sleep 30`.',
                options: bypass,
              })
              .pipe(
                Stream.tap((out) => {
                  if (out._tag === 'Started') id = out.id;
                  if (cancelled || !usesTool(out)) return Effect.void;
                  cancelled = true;
                  return claude.cancel(id);
                }),
              ),
          );
          ids.push(id);
          expect(ended(outs).status).toBe('cancelled');
          const live = yield* claude.live;
          expect(live.find((one) => one.id === id)?.status).toBe('ready');
          save('cancel', outs);
        }),
      TIMEOUT,
    );

    it.effect(
      'structured output comes in the result',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          const outs = yield* collect(
            claude.create({
              cwd,
              prompt: 'What is 2 + 3?',
              options: {
                ...options,
                outputFormat: {
                  type: 'json_schema',
                  schema: {
                    type: 'object',
                    properties: { answer: { type: 'number' } },
                    required: ['answer'],
                  },
                },
              },
            }),
          );
          startedId(outs);
          const result = ended(outs).result;
          expect(ended(outs).status).toBe('completed');
          expect(
            result?.subtype === 'success' ? result.structured_output : null,
          ).toEqual({ answer: 5 });
          save('structured', outs);
        }),
      TIMEOUT,
    );

    it.effect(
      'Bash has no background mode',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          const outs = yield* collect(
            claude.create({
              cwd,
              prompt:
                'Call the Bash tool once with command `echo bg` and run_in_background set to true. Then reply with only the tool result, verbatim.',
              options: bypass,
            }),
          );
          startedId(outs);
          expect(JSON.stringify(outs)).toContain(
            'An unexpected parameter `run_in_background` was provided',
          );
        }),
      TIMEOUT,
    );

    it.effect(
      'send resumes a session that is not live',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          expect(yield* claude.live).toEqual([]);
          const outs = yield* collect(
            claude.send({
              id: fruit.id,
              cwd,
              prompt:
                'Which words have you replied with so far? Reply with only those words.',
              options,
            }),
          );
          expect(outs[0]).toEqual(Out.Started({ id: fruit.id }));
          expect(ended(outs).status).toBe('completed');
          expect(resultText(outs).toLowerCase()).toContain('pear');
        }).pipe(Effect.provide(ClaudeReal.layer())),
      TIMEOUT,
    );

    it.effect(
      'deleteSession removes every session made here',
      () =>
        Effect.gen(function* () {
          const claude = yield* Claude;
          yield* Effect.forEach(ids, (id) =>
            claude.deleteSession(id, { dir: cwd }),
          );
          expect(yield* claude.listSessions({ dir: cwd })).toEqual([]);
        }),
      TIMEOUT,
    );
  });
});
