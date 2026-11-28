import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, layer } from '@effect/vitest';
import { Effect, Fiber, Stream } from 'effect';
import {
  type Event,
  OpenCode,
  type Out,
  type SessionID,
} from '../contract/index.js';
import { layer as openCodeRealLayer } from '../real/index.js';

const enabled = process.env['AI_TOOLKIT_V2_E2E'] === '1';
const [providerID = 'google', modelID = 'gemini-3.5-flash-lite'] = (
  process.env['AI_TOOLKIT_V2_OPENCODE_MODEL'] ?? 'google/gemini-3.5-flash-lite'
).split(/\/(.*)/);
const directory = enabled ? mkdtempSync(join(tmpdir(), 'opencode-e2e-')) : '';
const recordings = new URL('../fake/recordings/', import.meta.url);

afterAll(() => {
  if (!enabled) return;
  rmSync(directory, { recursive: true, force: true });
  execFileSync('npx', ['vp', 'fmt', fileURLToPath(recordings)], {
    stdio: 'ignore',
  });
});

const scrubbed = new Set(['settings', 'info', 'prompt', 'content', 'env']);

const anonymous = (text: string) =>
  text.replaceAll(directory, '/tmp/opencode-e2e').replaceAll(homedir(), '~');

const scrub = (value: unknown): unknown =>
  value === undefined
    ? null
    : JSON.parse(
        anonymous(
          JSON.stringify(value, (key, field: unknown) =>
            scrubbed.has(key)
              ? undefined
              : Array.isArray(field)
                ? field.slice(0, 3)
                : typeof field === 'string' && field.length > 300
                  ? `${field.slice(0, 300)}…`
                  : field,
          ),
        ),
      );

const save = (name: string, value: unknown) =>
  writeFileSync(
    new URL(`${name}.json`, recordings),
    `${JSON.stringify(value, null, 2)}\n`,
  );

const keep = (name: string, outs: ReadonlyArray<Out>) =>
  save(
    name,
    JSON.parse(
      anonymous(
        JSON.stringify(
          outs.flatMap((out): ReadonlyArray<Event> =>
            out._tag === 'Record'
              ? [out.record]
              : out._tag === 'Requested'
                ? [out.request]
                : [],
          ),
        ),
      ),
    ),
  );

const model = { providerID, id: modelID };
const location = { directory };
const shell = [{ action: 'shell', resource: '*', effect: 'ask' }];
const ids: { first?: SessionID; fork?: SessionID; asked?: SessionID } = {};
const methods: Record<string, unknown> = {};

const startedOf = (outs: ReadonlyArray<Out>) => {
  const first = outs[0];
  if (first?._tag !== 'Started') throw new Error('No Started first');
  return first.id;
};

const status = (outs: ReadonlyArray<Out>) => {
  const last = outs.at(-1);
  return last?._tag === 'Ended' ? last.status : undefined;
};

const call = (name: string, effect: Effect.Effect<unknown, unknown>) =>
  effect.pipe(
    Effect.tap((value) =>
      Effect.sync(() => {
        methods[name] = scrub(value);
      }),
    ),
  );

interface Messages {
  readonly data: ReadonlyArray<{ readonly id: string; readonly type: string }>;
}

describe.skipIf(!enabled)('OpenCode e2e', () => {
  layer(
    openCodeRealLayer({
      host: { database: { path: join(directory, 'opencode.db') } },
    }),
    { excludeTestServices: true, timeout: '60 seconds' },
  )((it) => {
    it.effect(
      'create starts a session and runs the first prompt',
      () =>
        Effect.gen(function* () {
          const opencode = yield* OpenCode;
          const outs = yield* opencode
            .create({
              session: { location, model } as never,
              prompt: { text: 'Reply with just the word: hi' },
            })
            .pipe(Stream.runCollect);
          ids.first = startedOf(outs);
          expect(status(outs)).toBe('completed');
          keep('create', outs);
          save(
            'session',
            scrub(yield* opencode.session({ sessionID: ids.first } as never)),
          );
        }),
      120_000,
    );

    it.effect(
      'send goes to the live instance',
      () =>
        Effect.gen(function* () {
          const opencode = yield* OpenCode;
          const id = ids.first as SessionID;
          expect((yield* opencode.live).map((live) => live.id)).toContain(id);
          const outs = yield* opencode
            .send({
              sessionID: id,
              prompt: { text: 'Reply with just the word: ok' },
            })
            .pipe(Stream.runCollect);
          expect(startedOf(outs)).toBe(id);
          expect(status(outs)).toBe('completed');
          keep('send', outs);
        }),
      120_000,
    );

    it.effect(
      'fork starts a new session before a message',
      () =>
        Effect.gen(function* () {
          const opencode = yield* OpenCode;
          const id = ids.first as SessionID;
          const messages = (yield* opencode.messages({
            sessionID: id,
            order: 'desc',
          } as never)) as Messages;
          const last = messages.data.find((message) => message.type === 'user');
          const outs = yield* opencode
            .fork({
              sessionID: id,
              before: last?.id,
              prompt: { text: 'Reply with just the word: fork' },
            } as never)
            .pipe(Stream.runCollect);
          ids.fork = startedOf(outs);
          expect(ids.fork).not.toBe(id);
          expect(status(outs)).toBe('completed');
          keep('fork', outs);
        }),
      120_000,
    );

    it.effect(
      'a permission is answered and a steer joins the Run',
      () =>
        Effect.gen(function* () {
          const opencode = yield* OpenCode;
          const steers: Array<Fiber.Fiber<ReadonlyArray<Out>, unknown>> = [];
          const outs = yield* opencode
            .create({
              session: { location, model, permissions: shell } as never,
              prompt: {
                text: 'Use the shell tool to run: echo hi. Then reply with just: done',
              },
            })
            .pipe(
              Stream.tap((out) =>
                out._tag === 'Started'
                  ? Effect.sync(() => {
                      ids.asked = out.id;
                    })
                  : out._tag === 'Requested'
                    ? opencode
                        .send({
                          sessionID: ids.asked as SessionID,
                          prompt: { text: 'Also add the word: steered' },
                          mode: 'steer',
                        })
                        .pipe(
                          Stream.runCollect,
                          Effect.forkChild,
                          Effect.tap((fiber) =>
                            Effect.sync(() => steers.push(fiber)),
                          ),
                          Effect.andThen(
                            opencode.respond(
                              ids.asked as SessionID,
                              out.request.type === 'permission.asked'
                                ? out.request.data.id
                                : out.request.data.form.id,
                              { decision: 'once' } as never,
                            ),
                          ),
                        )
                    : Effect.void,
              ),
              Stream.runCollect,
            );
          expect(startedOf(outs)).toBe(ids.asked);
          expect(outs.some((out) => out._tag === 'Requested')).toBe(true);
          expect(outs.some((out) => out._tag === 'Steered')).toBe(true);
          expect(status(outs)).toBe('completed');
          const steered = yield* Fiber.joinAll(steers);
          expect(steered).toEqual([outs]);
          keep('permission', outs);
        }),
      120_000,
    );

    it.effect(
      'a steer on an idle session runs as its own Run',
      () =>
        Effect.gen(function* () {
          const opencode = yield* OpenCode;
          const id = ids.asked as SessionID;
          const outs = yield* opencode
            .send({
              sessionID: id,
              prompt: { text: 'Reply with just the word: idle' },
              mode: 'steer',
            })
            .pipe(Stream.runCollect);
          expect(startedOf(outs)).toBe(id);
          expect(outs.some((out) => out._tag === 'Steered')).toBe(false);
          expect(status(outs)).toBe('completed');
        }),
      120_000,
    );

    it.effect(
      'cancel stops the Run in progress',
      () =>
        Effect.gen(function* () {
          const opencode = yield* OpenCode;
          const id = ids.first as SessionID;
          const outs = yield* opencode
            .send({
              sessionID: id,
              prompt: { text: 'Count from 1 to 300, one number per line.' },
            })
            .pipe(
              Stream.tap((out) =>
                out._tag === 'Record' &&
                out.record.type === 'session.step.started'
                  ? opencode.cancel(id)
                  : Effect.void,
              ),
              Stream.runCollect,
            );
          expect(status(outs)).toBe('cancelled');
          keep('cancel', outs);
        }),
      120_000,
    );

    it.effect(
      'each harness-specific method answers once',
      () =>
        Effect.gen(function* () {
          const opencode = yield* OpenCode;
          const first = ids.first as SessionID;
          const fork = ids.fork as SessionID;
          const at = { location };
          yield* call('sessions', opencode.sessions({ limit: 3 }));
          yield* call('session', opencode.session({ sessionID: first }));
          const messages = (yield* call(
            'messages',
            opencode.messages({ sessionID: first, order: 'desc' } as never),
          )) as Messages;
          const user = messages.data.find((message) => message.type === 'user');
          yield* call(
            'message',
            opencode.message({
              sessionID: first,
              messageID: user?.id,
            } as never),
          );
          yield* call('context', opencode.context({ sessionID: first }));
          yield* call('diff', opencode.diff({ sessionID: first }));
          yield* call(
            'revert',
            opencode.revert({ sessionID: first, messageID: user?.id } as never),
          );
          yield* call('unrevert', opencode.unrevert({ sessionID: first }));
          const forked = (yield* opencode.messages({
            sessionID: fork,
            order: 'desc',
          } as never)) as Messages;
          yield* opencode.revert({
            sessionID: fork,
            messageID: forked.data.find((message) => message.type === 'user')
              ?.id,
          } as never);
          yield* call(
            'commitRevert',
            opencode.commitRevert({ sessionID: fork }),
          );
          yield* call(
            'update',
            opencode.update({ sessionID: first, title: 'e2e' }),
          );
          yield* call(
            'switchModel',
            opencode.switchModel({ sessionID: first, model } as never),
          );
          yield* call(
            'switchAgent',
            opencode.switchAgent({ sessionID: first, agent: 'build' } as never),
          );
          yield* call(
            'permissions',
            opencode.permissions({ sessionID: first }),
          );
          yield* call('forms', opencode.forms({ sessionID: first }));
          yield* call('providers', opencode.providers(at));
          yield* call('models', opencode.models(at));
          yield* call('defaultModel', opencode.defaultModel(at));
          yield* call('agents', opencode.agents(at));
          yield* call('commands', opencode.commands(at));
          yield* call('skills', opencode.skills(at));
          yield* call('config', opencode.config(at));
          yield* call('mcp', opencode.mcp(at));
          yield* call('usageLimits', opencode.usageLimits(at));
          yield* call(
            'compact',
            opencode.compact({ sessionID: ids.asked as SessionID }),
          );
          yield* call('remove', opencode.remove({ sessionID: fork }));
          const client = yield* opencode.client;
          const info: Effect.Effect<unknown, unknown> = client.server.info();
          expect(yield* info).toBeDefined();
          save('methods', methods);
          expect(Object.keys(methods)).toHaveLength(25);
        }),
      120_000,
    );
  });
});
