import { Effect, Layer, Option } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import type { DataOf } from '@kestack/kabuki/types';
import { fakeAgent } from '../../../../../../../../../services/agent/fake/index.js';
import type { Reply } from '../../../../../../../../../services/agent/fake/index.js';
import { Preferences } from '../../../../../../../../../services/preferences/contract/index.js';
import { fakePreferences } from '../../../../../../../../../services/preferences/fake/index.js';
import { fakeProjectRegistry } from '../../../../../../../../../services/project-registry/fake/index.js';
import { Remembered } from '../../../../../logic/shared/index.js';
import { Chat } from '../index.js';
import type { ChatShape } from '../logic/shared/index.js';

const PROJECT = '/code/todo';
const WORKTREE = '/code/todo-wip';

const settle = Effect.promise(
  () => new Promise((done) => setTimeout(done, 40)),
);

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const start = (
  replies: ReadonlyArray<Reply>,
  preferences = fakePreferences(),
) =>
  Effect.gen(function* () {
    const agent = yield* fakeAgent(replies);
    const app = yield* Runtime.scoped(Chat, {
      input: { name: 'todo-tab', app: 'Todo' },
      layer: Layer.mergeAll(
        agent.layer,
        Layer.succeed(Preferences)(preferences),
        fakeProjectRegistry([{ id: '1', name: 'todo', path: PROJECT }], {
          [PROJECT]: [
            {
              folder: PROJECT,
              branch: 'main',
              head: 'aaaaaaa',
              primary: true,
              current: true,
            },
            {
              folder: WORKTREE,
              branch: 'wip',
              head: 'bbbbbbb',
              primary: false,
              current: false,
            },
          ],
        }),
      ),
    });
    yield* settle;
    const send = (message: unknown) =>
      Effect.andThen(
        Effect.sync(() => app.root.send(message as never)),
        settle,
      );
    const chat = () =>
      app.snapshot.root as unknown as DataOf<typeof ChatShape> & {
        readonly state: { readonly _tag: string; readonly folder?: string };
      };
    return { agent, send, chat };
  });

describe('Chat', () => {
  it('asks which Project the app is in, as Story does', () =>
    run(
      Effect.gen(function* () {
        const { chat } = yield* start([]);
        expect(chat().state._tag).toBe('Choice');
        expect(chat().model.projects).toEqual([
          { name: 'todo', path: PROJECT },
        ]);
      }),
    ));

  it('starts in the Worktree Story picked for the app', () =>
    run(
      Effect.gen(function* () {
        const preferences = fakePreferences();
        yield* preferences.save('kabuki:story:Todo', Remembered, {
          project: PROJECT,
          folder: WORKTREE,
          thread: 'a-story-thread',
        });
        const { chat } = yield* start([], preferences);
        expect(chat().state).toEqual({
          _tag: 'Open',
          project: PROJECT,
          folder: WORKTREE,
        });
        expect(chat().model.thread).toBeNull();
      }),
    ));

  it('asks with DevTools’ MCP tools, naming the Kabuki Session, and shows the answer', () =>
    run(
      Effect.gen(function* () {
        const { agent, send, chat } = yield* start([
          {
            activity: ["Using DevTools' kabuki_look"],
            text: 'It is **Ready**.',
          },
        ]);
        yield* send({ _tag: 'Chose', project: PROJECT });
        yield* send({ _tag: 'Asked', question: '  What state is it in?  ' });
        const [asked] = agent.asked;
        expect(asked?.mcp).toBe(true);
        expect(asked?.schema).toBeUndefined();
        expect(asked?.folder).toBe(PROJECT);
        expect(asked?.prompt).toBe('What state is it in?');
        expect(asked?.system).toContain('"todo-tab"');
        expect(chat().model.turns).toEqual([
          {
            question: 'What state is it in?',
            chips: [],
            text: 'It is **Ready**.',
          },
        ]);
        expect(chat().model.run.status).toBe('done');
        expect(chat().model.pending).toBeNull();
      }),
    ));

  it('follows up in the same chat, lists only its own chats, and remembers the open one', () =>
    run(
      Effect.gen(function* () {
        const preferences = fakePreferences();
        const { agent, send, chat } = yield* start(
          [{ text: 'One.' }, { text: 'Two.' }],
          preferences,
        );
        yield* send({ _tag: 'Chose', project: PROJECT });
        yield* send({ _tag: 'Asked', question: 'first' });
        const thread = chat().model.thread;
        yield* send({ _tag: 'Asked', question: 'second' });
        expect(agent.asked.map((one) => one.thread)).toEqual([thread, thread]);
        expect(chat().model.turns).toHaveLength(2);
        expect(chat().model.threads.map(({ id }) => id)).toEqual([thread]);
        const kept = yield* preferences.load('kabuki:chat:Todo', Remembered);
        expect(Option.getOrNull(kept)).toEqual({
          project: PROJECT,
          folder: PROJECT,
          thread,
        });
        yield* send({ _tag: 'Opened', thread: null });
        expect(chat().model.thread).toBeNull();
        expect(chat().model.turns).toEqual([]);
      }),
    ));

  it('says why the Agent could not answer, and asks again on Retry', () =>
    run(
      Effect.gen(function* () {
        const { agent, send, chat } = yield* start([
          { failed: 'claude is missing' },
          { text: 'Here.' },
        ]);
        yield* send({ _tag: 'Chose', project: PROJECT });
        yield* send({ _tag: 'Asked', question: 'hello' });
        expect(chat().model.run).toMatchObject({
          status: 'failed',
          reason: 'claude is missing',
        });
        yield* send({ _tag: 'Retried' });
        expect(agent.asked.map(({ prompt }) => prompt)).toEqual([
          'hello',
          'hello',
        ]);
        expect(chat().model.turns.at(-1)?.text).toBe('Here.');
      }),
    ));
});
