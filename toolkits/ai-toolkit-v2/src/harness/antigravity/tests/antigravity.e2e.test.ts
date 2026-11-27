import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type * as acp from '@agentclientprotocol/sdk/unstable';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Schedule, Stream } from 'effect';
import { Antigravity, type Out } from '../contract/index.ts';
import type { Recording, Step } from '../fake/recordings/index.ts';
import * as AntigravityReal from '../real/index.ts';

const recordings = join(import.meta.dirname, '..', 'fake', 'recordings');

const save = (name: string, data: unknown) =>
  Effect.promise(() =>
    writeFile(
      join(recordings, `${name}.json`),
      `${JSON.stringify(data, null, 2).replaceAll(homedir(), '~')}\n`,
    ),
  );

const text = (value: string): Array<acp.ContentBlock> => [
  { type: 'text', text: value },
];

const model = 'gemini-3.8-flash';
const cheap = [
  { configId: 'model', value: model },
  { configId: 'thought_level', value: 'low' },
];

const fixed = new Set(['config_option_update', 'available_commands_update']);

const stepsOf = (outs: ReadonlyArray<Out>): ReadonlyArray<Step> =>
  outs.flatMap((out): ReadonlyArray<Step> => {
    if (out._tag === 'Record') {
      return fixed.has(out.record.update.sessionUpdate)
        ? []
        : [{ update: out.record.update }];
    }
    if (out._tag !== 'Requested') return [];
    return out.request.method === 'session/request_permission'
      ? [{ permission: out.request.params }]
      : [{ elicitation: out.request.params }];
  });

const ended = (outs: ReadonlyArray<Out>) => {
  const last = outs.at(-1);
  return last?._tag === 'Ended' ? last : undefined;
};

const recordingOf = (outs: ReadonlyArray<Out>): Recording => ({
  steps: stepsOf(outs),
  response: ended(outs)?.result ?? { stopReason: 'end_turn' },
});

const said = (outs: ReadonlyArray<Out>) =>
  outs
    .flatMap((out) =>
      out._tag === 'Record' &&
      out.record.update.sessionUpdate === 'agent_message_chunk' &&
      out.record.update.content.type === 'text'
        ? [out.record.update.content.text]
        : [],
    )
    .join('');

const idOf = (outs: ReadonlyArray<Out>) => {
  const first = outs[0];
  return first?._tag === 'Started' ? first.id : '';
};

const collect = <R, R2 = never>(
  stream: Stream.Stream<Out, unknown, R>,
  onOut: (out: Out) => Effect.Effect<void, unknown, R2> = () => Effect.void,
) =>
  stream.pipe(
    Stream.tap((out) => onOut(out).pipe(Effect.orDie)),
    Stream.runCollect,
    Effect.map((all) => [...all]),
  );

const allow = (request: acp.RequestPermissionRequest) =>
  request.options.find((option) => option.kind === 'allow_once')?.optionId ??
  'allow';

const blue = (request: acp.CreateElicitationRequest) => {
  const schema = request as {
    readonly requestedSchema?: {
      readonly properties?: Record<
        string,
        { readonly oneOf?: ReadonlyArray<{ const: string; title: string }> }
      >;
    };
  };
  const choices = schema.requestedSchema?.properties?.['q1']?.oneOf ?? [];
  return choices.find((choice) => /blue/i.test(choice.title))?.const ?? 'Blue';
};

describe.runIf(process.env['AI_TOOLKIT_V2_E2E'] === '1')(
  'Antigravity on the real agy acp',
  () => {
    it.live(
      'creates, sends, steers, answers, cancels, resumes and lists',
      () =>
        Effect.gen(function* () {
          const service = yield* Antigravity;
          const cwd = yield* Effect.acquireRelease(
            Effect.promise(() => mkdtemp(join(tmpdir(), 'agy-e2e-'))),
            (dir) =>
              Effect.promise(() => rm(dir, { recursive: true, force: true })),
          );
          const session = { cwd, mcpServers: [] };
          const initialize = yield* service.initialize();
          expect(initialize.agentInfo?.name).toContain('Antigravity');

          const created = yield* collect(
            service.create({
              session,
              config: cheap,
              prompt: text('Reply with the single word: hi'),
            }),
          );
          const id = idOf(created);
          expect(ended(created)?.status).toBe('completed');
          yield* save('create', recordingOf(created));
          const live = (yield* service.live).find((one) => one.id === id);
          const current = (configId: string) =>
            live?.configOptions?.find((option) => option.id === configId)
              ?.currentValue;
          expect(current('model')).toBe(model);
          expect(live?.commands.map((command) => command.name)).toContain(
            'compact',
          );

          const set = yield* service.setConfigOption({
            sessionId: id,
            configId: 'model',
            value: model,
          });
          expect(
            set.configOptions.find((option) => option.id === 'model')
              ?.currentValue,
          ).toBe(model);

          const sent = yield* collect(
            service.send({
              session: { sessionId: id, cwd },
              prompt: text('Reply with the single word: two'),
            }),
          );
          expect(idOf(sent)).toBe(id);
          expect(ended(sent)?.status).toBe('completed');
          yield* save('send', recordingOf(sent));

          const answer = (out: Out) =>
            out._tag !== 'Requested'
              ? Effect.void
              : out.request.method === 'session/request_permission'
                ? service.respond(id, out.request.id, {
                    outcome: {
                      outcome: 'selected',
                      optionId: allow(out.request.params),
                    },
                  })
                : service.respond(id, out.request.id, {
                    action: 'accept',
                    content: { q1: blue(out.request.params) },
                  });

          const permitted = yield* collect(
            service.send({
              session: { sessionId: id, cwd },
              prompt: text(
                'Use run_command to run exactly: touch made.txt ; then reply with the word: ok',
              ),
            }),
            answer,
          );
          expect(permitted.some((out) => out._tag === 'Requested')).toBe(true);
          expect(ended(permitted)?.status).toBe('completed');
          expect(existsSync(join(cwd, 'made.txt'))).toBe(true);
          yield* save('permission', recordingOf(permitted));

          let head: Array<Out> = [];
          const steered = yield* collect(
            service.send({
              session: { sessionId: id, cwd },
              prompt: text(
                'Use run_command to run exactly: sleep 5 ; then reply with the word: done',
              ),
            }),
            (out) =>
              out._tag === 'Requested'
                ? answer(out).pipe(
                    Effect.andThen(Effect.sleep('1 second')),
                    Effect.andThen(
                      collect(
                        service
                          .send({
                            session: { sessionId: id, cwd },
                            prompt: text(
                              'Change of plan: reply with the single word: steered',
                            ),
                            mode: 'steer',
                          })
                          .pipe(
                            Stream.takeUntil((one) => one._tag === 'Steered'),
                          ),
                      ),
                    ),
                    Effect.map((outs) => {
                      head = outs;
                    }),
                  )
                : Effect.void,
          );
          expect(head.map((out) => out._tag)).toEqual(
            steered.slice(0, head.length).map((out) => out._tag),
          );
          expect(head.at(-1)?._tag).toBe('Steered');
          const at = steered.findIndex((out) => out._tag === 'Steered');
          expect(at).toBeGreaterThan(0);
          expect(ended(steered)?.status).toBe('completed');
          expect(said(steered.slice(at)).toLowerCase()).toContain('steered');
          yield* save('steer', recordingOf(steered.slice(0, at)));
          yield* save('steered', recordingOf(steered.slice(at)));

          const asked = yield* collect(
            service.send({
              session: { sessionId: id, cwd },
              prompt: text(
                'Use your ask_question tool to ask me one multiple-choice question: my favourite colour, red or blue. Then reply with my answer only.',
              ),
            }),
            answer,
          );
          expect(
            asked.some(
              (out) =>
                out._tag === 'Requested' &&
                out.request.method === 'elicitation/create',
            ),
          ).toBe(true);
          expect(said(asked).toLowerCase()).toContain('blue');
          yield* save('question', recordingOf(asked));

          const before = yield* service.connection(id);
          const cancelled = yield* collect(
            service.send({
              session: { sessionId: id, cwd },
              prompt: text(
                'Use run_command to run exactly: sleep 20 ; then reply with the word: done',
              ),
            }),
            (out) =>
              out._tag === 'Requested'
                ? answer(out).pipe(
                    Effect.andThen(Effect.sleep('1 second')),
                    Effect.andThen(service.cancel(id)),
                  )
                : Effect.void,
          );
          expect(ended(cancelled)?.status).toBe('cancelled');
          yield* save('cancel', recordingOf(cancelled));
          const again = yield* collect(
            service.send({
              session: { sessionId: id, cwd },
              prompt: text('Reply with the single word: again'),
            }),
          );
          expect(ended(again)?.status).toBe('completed');
          expect(yield* service.connection(id)).toBe(before);

          const listed = yield* service.listSessions({ cwd });
          expect(listed.sessions.map((one) => one.sessionId)).toContain(id);

          yield* service.live.pipe(
            Effect.repeat({
              until: (all) => all.length === 0,
              schedule: Schedule.spaced('500 millis'),
            }),
            Effect.timeout('20 seconds'),
          );
          const resumed = yield* collect(
            service.send({
              session: { sessionId: id, cwd },
              prompt: text('Reply with the single word: three'),
            }),
          );
          expect(idOf(resumed)).toBe(id);
          expect(ended(resumed)?.status).toBe('completed');
          expect(yield* service.connection(id)).not.toBe(before);
          yield* save('resumed', recordingOf(resumed));
          yield* service.closeSession(id);
          expect(yield* service.live).toEqual([]);

          const structured = yield* service.prompt({
            cwd,
            model,
            prompt: 'Answer with the word hi.',
            jsonSchema: {
              type: 'object',
              properties: { word: { type: 'string' } },
              required: ['word'],
            },
          });
          expect(structured.structured_output).toEqual({ word: 'hi' });

          yield* save('agent', {
            initialize,
            session: {
              modes: live?.modes,
              configOptions: live?.configOptions,
            },
            commands: live?.commands.slice(0, 3),
            sessions: {
              sessions: listed.sessions.filter((one) => one.sessionId === id),
            },
            print: structured,
          });
          yield* Effect.promise(() =>
            promisify(execFile)('npx', ['vp', 'fmt', '--write', recordings]),
          );
        }).pipe(Effect.provide(AntigravityReal.layer({ linger: '2 seconds' }))),
      { timeout: 300_000 },
    );
  },
);
