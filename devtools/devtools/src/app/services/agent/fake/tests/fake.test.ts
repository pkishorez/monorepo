import { Effect, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { Agent } from '../../contract/index.js';
import { fakeAgent } from '../index.js';

const latest = (thread: string) =>
  Effect.flatMap(Agent, (agent) =>
    agent.watch(thread).pipe(
      Stream.take(1),
      Stream.runCollect,
      Effect.map((all) =>
        ([...all][0] ?? []).map((message) =>
          Object.fromEntries(
            Object.entries(message).filter(([key]) => key !== 'at'),
          ),
        ),
      ),
    ),
  );

const tags = (messages: ReadonlyArray<Record<string, unknown>>) =>
  messages.map((message) =>
    message['_tag'] === 'Status' ? message['status'] : message['_tag'],
  );

describe('the fake Agent', () => {
  it('answers each question with the next scripted reply', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fakeAgent([
          { activity: ['Reading src/app.ts'], data: { title: 'App' } },
          { failed: 'Claude Code is not signed in.' },
        ]);
        return yield* Effect.gen(function* () {
          const agent = yield* Agent;
          const thread = yield* agent.ask({
            folder: '/repo',
            prompt: 'What is this?',
            system: 'Be brief.',
          });
          expect(yield* latest(thread)).toEqual([
            { _tag: 'User', text: 'What is this?' },
            { _tag: 'Status', status: 'running' },
            { _tag: 'Activity', text: 'Reading src/app.ts' },
            { _tag: 'Assistant', data: { title: 'App' } },
            { _tag: 'Status', status: 'done' },
          ]);
          yield* agent.followUp({ thread, prompt: 'And then?' });
          expect((yield* latest(thread)).at(-1)).toEqual({
            _tag: 'Status',
            status: 'failed',
            reason: 'Claude Code is not signed in.',
          });
          expect(
            fake.asked.map(({ prompt, system }) => [prompt, system]),
          ).toEqual([
            ['What is this?', 'Be brief.'],
            ['And then?', 'Be brief.'],
          ]);
          expect((yield* agent.threads('/repo'))[0]).toMatchObject({
            id: thread,
            title: 'What is this?',
            status: 'failed',
          });
        }).pipe(Effect.provide(fake.layer));
      }),
    ));

  it('runs with no reply left until cancelled or replied to', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fakeAgent();
        return yield* Effect.gen(function* () {
          const agent = yield* Agent;
          const first = yield* agent.ask({ folder: '/repo', prompt: 'One' });
          expect(tags(yield* latest(first))).toEqual(['User', 'running']);
          yield* fake.reply(first, { text: 'Done.' });
          expect(tags(yield* latest(first))).toEqual([
            'User',
            'running',
            'Assistant',
            'done',
          ]);
          const second = yield* agent.ask({ folder: '/repo', prompt: 'Two' });
          yield* agent.cancel(second);
          expect(tags(yield* latest(second)).at(-1)).toBe('cancelled');
        }).pipe(Effect.provide(fake.layer));
      }),
    ));
});
