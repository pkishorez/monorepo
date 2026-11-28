import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Stream } from 'effect';
import {
  CreateElicitationRequest,
  type CreateElicitationResponse,
  ElicitationPropertySchema,
  type RequestPermissionResponse,
  type SessionUpdate,
} from '@agentclientprotocol/sdk/unstable';
import type {
  AcpAgent,
  ConfigValue,
  Live,
  Out,
  Pending,
} from '../contract/index.ts';
import type { Recording, Step } from '../fake/index.ts';
import { layer, type Options } from '../real/index.ts';

const e2e = process.env['AI_TOOLKIT_V2_E2E'] === '1';
const RECORDINGS = join(import.meta.dirname, '..', 'fake', 'recordings');
const TIMEOUT = 300_000;

class Agy extends Context.Service<Agy, AcpAgent>()('test/Agy') {}

const options: Options = {
  command: 'agy',
  args: ['acp'],
  linger: '1 second',
};

const config: ReadonlyArray<ConfigValue> = [
  { configId: 'model', value: 'gemini-3.8-flash' },
  { configId: 'thought_level', value: 'low' },
];

const text = (value: string) => [{ type: 'text' as const, text: value }];

const trim = (update: SessionUpdate): SessionUpdate =>
  update.sessionUpdate === 'available_commands_update'
    ? { ...update, availableCommands: update.availableCommands.slice(0, 3) }
    : update;

const ended = (outs: ReadonlyArray<Out>) => {
  const last = outs.at(-1);
  if (last?._tag !== 'Ended') throw new Error('No Ended last');
  return last;
};

const step = (out: Out): Array<Step> => {
  if (out._tag === 'Record') return [{ update: trim(out.record.update) }];
  if (out._tag !== 'Requested') return [];
  if (out.method === 'elicitation/create') {
    return [{ elicitation: out.request }];
  }
  const { sessionId: _, ...request } = out.request;
  return [{ request }];
};

const allow = (pending: Pending): RequestPermissionResponse => {
  if (pending.method !== 'session/request_permission') {
    throw new Error(`not a permission: ${pending.method}`);
  }
  const option =
    pending.request.options.find((entry) => entry.kind === 'allow_once') ??
    pending.request.options[0]!;
  return { outcome: { outcome: 'selected', optionId: option.optionId } };
};

const choose = (pending: Pending): CreateElicitationResponse => {
  if (pending.method !== 'elicitation/create') {
    throw new Error(`not an elicitation: ${pending.method}`);
  }
  if (!CreateElicitationRequest.isForm(pending.request)) {
    return { action: 'decline' };
  }
  const properties = pending.request.requestedSchema.properties ?? {};
  const content = Object.fromEntries(
    Object.entries(properties).flatMap(([key, property]) => {
      if (!ElicitationPropertySchema.isString(property)) return [];
      const first = property.oneOf?.[0];
      return first ? [[key, first.const]] : [];
    }),
  );
  return { action: 'accept', content };
};

describe.skipIf(!e2e)('Acp e2e', () => {
  it.live(
    'antigravity',
    () =>
      Effect.gen(function* () {
        const cwd = realpathSync(
          mkdtempSync(join(tmpdir(), 'ai-toolkit-v2-acp-antigravity-')),
        );
        const service = yield* Agy;
        const recordings: Array<Recording> = [];
        const initialize = yield* service.initialize;
        const capabilities = initialize.agentCapabilities;
        let live: Live | undefined;

        const save = (name: string, outs: ReadonlyArray<Out>) => {
          const end = ended(outs);
          recordings.push({
            name,
            initialize,
            session: {
              modes: live?.modes ?? null,
              configOptions: live?.configOptions ?? null,
            },
            steps: outs.flatMap(step),
            response: end.result ?? { stopReason: 'end_turn' },
          });
        };

        const answering =
          (id: string, answer: 'allow' | 'choose' | 'cancel') => (out: Out) =>
            out._tag !== 'Requested'
              ? Effect.void
              : answer === 'cancel'
                ? service.cancel(id)
                : service.respond(
                    id,
                    out.requestId,
                    answer === 'allow' ? allow(out) : choose(out),
                  );

        const created = yield* service
          .create({
            session: { cwd, mcpServers: [] },
            prompt: text('Reply with the single word OK.'),
            config,
          })
          .pipe(Stream.runCollect);
        const first = created[0];
        if (first?._tag !== 'Started') throw new Error('No Started first');
        const id = first.id;
        expect(ended(created).status).toBe('completed');
        live = (yield* service.live).find((entry) => entry.id === id);
        expect(live?.status).toBe('ready');
        save('reply', created);

        const session = { sessionId: id, cwd, mcpServers: [] };
        const sent = yield* service
          .send({ session, prompt: text('Reply with the single word YES.') })
          .pipe(Stream.runCollect);
        expect(ended(sent).status).toBe('completed');
        save('send', sent);

        const permitted = yield* service
          .send({
            session,
            prompt: text(
              'Create a file named hi.txt containing hi. Do nothing else.',
            ),
          })
          .pipe(Stream.tap(answering(id, 'allow')), Stream.runCollect);
        expect(permitted.some((out) => out._tag === 'Requested')).toBe(true);
        expect(ended(permitted).status).toBe('completed');
        expect(existsSync(join(cwd, 'hi.txt'))).toBe(true);
        save('permission', permitted);

        const asked = yield* service
          .send({
            session,
            prompt: text(
              'Use your ask_question tool to ask me one question: red or blue, as two choices. Then reply with my choice only.',
            ),
          })
          .pipe(Stream.tap(answering(id, 'choose')), Stream.runCollect);
        const question = asked.find(
          (out) =>
            out._tag === 'Requested' && out.method === 'elicitation/create',
        );
        expect(question).toBeDefined();
        expect(ended(asked).status).toBe('completed');
        const reply = asked
          .flatMap((out) =>
            out._tag === 'Record' &&
            out.record.update.sessionUpdate === 'agent_message_chunk' &&
            out.record.update.content.type === 'text'
              ? [out.record.update.content.text]
              : [],
          )
          .join('');
        expect(reply.toLowerCase()).toContain('red');
        save('question', asked);

        const cancelled = yield* service
          .send({
            session,
            prompt: text(
              'Create a file named bye.txt containing bye. Do nothing else.',
            ),
          })
          .pipe(Stream.tap(answering(id, 'cancel')), Stream.runCollect);
        expect(ended(cancelled).status).toBe('cancelled');
        save('cancelled', cancelled);

        const modes = live?.modes;
        if (modes) {
          yield* service.setMode({
            sessionId: id,
            modeId: modes.currentModeId,
          });
        }
        const option = live?.configOptions?.find(
          (entry) => entry.type === 'select',
        );
        if (option?.type === 'select') {
          yield* service.setConfigOption({
            sessionId: id,
            configId: option.id,
            value: option.currentValue,
          });
        }
        expect(yield* service.connection(id)).toBeDefined();

        if (capabilities?.sessionCapabilities?.list) {
          const listed = yield* service.listSessions({ cwd });
          expect(listed.sessions.some((entry) => entry.sessionId === id)).toBe(
            true,
          );
        } else {
          const refused = yield* service
            .listSessions({ cwd })
            .pipe(Effect.flip);
          expect(refused._tag).toBe('AcpError');
        }

        yield* Effect.sleep('2 seconds');
        expect((yield* service.live).length).toBe(0);

        const resumed = yield* service
          .send({
            session,
            prompt: text('Which file did you create first? One word.'),
          })
          .pipe(Stream.runCollect);
        expect(ended(resumed).status).toBe('completed');
        save('resumed', resumed);

        const sanitized = JSON.stringify(recordings, null, 2)
          .replaceAll(cwd, '/tmp/ai-toolkit-v2-acp')
          .replaceAll(homedir(), '/Users/me');
        const file = join(RECORDINGS, 'antigravity.json');
        writeFileSync(file, `${sanitized}\n`);
        execFileSync('npx', ['vp', 'fmt', '--write', file]);
      }).pipe(Effect.provide(layer(Agy, options))),
    TIMEOUT,
  );
});
