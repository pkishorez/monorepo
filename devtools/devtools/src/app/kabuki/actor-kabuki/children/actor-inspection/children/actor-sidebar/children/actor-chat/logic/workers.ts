import { Effect, Option, Stream } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { Agent } from '../../../../../../../../../services/agent/contract/index.js';
import type { Message } from '../../../../../../../../../services/agent/contract/index.js';
import { Preferences } from '../../../../../../../../../services/preferences/contract/index.js';
import { ProjectRegistry } from '../../../../../../../../../services/project-registry/contract/index.js';
import {
  IDLE,
  Remembered,
  storyKeyOf,
} from '../../../../../logic/shared/index.js';
import { THREAD_KIND } from './shared/index.js';
import type { ChatShape, Turn } from './shared/index.js';

const RETRY = '2 seconds';

const ACTIVITY = 12;

const turnsOf = (messages: ReadonlyArray<Message>) => {
  const turns: Array<Turn> = [];
  let run = IDLE;
  for (const message of messages) {
    switch (message._tag) {
      case 'User':
        turns.push({ question: message.text, chips: [], text: null });
        run = { ...IDLE, status: 'running', since: message.at };
        break;
      case 'Assistant': {
        const last = turns.pop();
        if (last) turns.push({ ...last, text: message.text ?? null });
        break;
      }
      case 'Activity':
        run = {
          ...run,
          activity: [...run.activity, message.text].slice(-ACTIVITY),
        };
        break;
      case 'Status':
        run = {
          ...run,
          status: message.status,
          reason: message.reason ?? null,
          since: message.status === 'running' ? message.at : run.since,
        };
    }
  }
  return { turns, run };
};

const keyOf = (app: string) => `kabuki:chat:${app}`;

export const workers: WorkersOf<typeof ChatShape> = {
  recall: {
    while: ({ state }) => state._tag === 'Recall',
    run: (self) =>
      Effect.gen(function* () {
        const preferences = yield* Preferences;
        const { model } = yield* self.get;
        const own = yield* preferences.load(keyOf(model.app), Remembered);
        const story = yield* preferences.load(
          storyKeyOf(model.app),
          Remembered,
        );
        yield* self.send({
          _tag: 'Recalled',
          remembered: Option.getOrNull(
            Option.orElse(own, () =>
              Option.map(story, (picked) => ({ ...picked, thread: null })),
            ),
          ),
        });
      }),
  },
  remember: {
    each: ({ state, model }) =>
      state._tag === 'Open'
        ? [
            JSON.stringify({
              project: state.project,
              folder: state.folder,
              thread: model.thread,
            }),
          ]
        : [],
    run: (self, key) =>
      Effect.gen(function* () {
        const preferences = yield* Preferences;
        const { model } = yield* self.get;
        yield* preferences.save(
          keyOf(model.app),
          Remembered,
          JSON.parse(key) as typeof Remembered.Type,
        );
      }),
  },
  projects: {
    while: ({ model }) => model.projects === null && model.listProblem === null,
    run: (self) =>
      Effect.flatMap(ProjectRegistry, (registry) => registry.projects).pipe(
        Effect.map((projects) => ({
          _tag: 'Listed' as const,
          projects: projects.map(({ name, path }) => ({ name, path })),
        })),
        Effect.catch(({ message: problem }) =>
          Effect.succeed({ _tag: 'ListRefused' as const, problem }),
        ),
        Effect.flatMap((message) => self.send(message)),
      ),
  },
  worktrees: {
    each: ({ state, model }) =>
      state._tag === 'Open' &&
      model.worktrees === null &&
      model.worktreesProblem === null
        ? [state.project]
        : [],
    run: (self, project) =>
      Effect.flatMap(ProjectRegistry, (registry) =>
        registry.worktrees(project),
      ).pipe(
        Effect.map((worktrees) => ({
          _tag: 'WorktreesListed' as const,
          worktrees,
        })),
        Effect.catch(({ message: problem }) =>
          Effect.succeed({ _tag: 'WorktreesRefused' as const, problem }),
        ),
        Effect.flatMap((message) => self.send(message)),
      ),
  },
  threads: {
    each: ({ state, model }) =>
      state._tag === 'Open'
        ? [JSON.stringify([state.folder, model.thread, model.run.status])]
        : [],
    run: (self, key) =>
      Effect.gen(function* () {
        const agent = yield* Agent;
        const [folder] = JSON.parse(key) as [string];
        const threads = yield* agent.threads(folder, THREAD_KIND);
        yield* self.send({
          _tag: 'Threaded',
          threads: threads.map(({ id, title, createdAt }) => ({
            id,
            title,
            createdAt,
          })),
        });
      }).pipe(Effect.ignore),
  },
  watch: {
    each: ({ state, model }) =>
      state._tag === 'Open' && model.thread !== null
        ? [JSON.stringify([state.folder, model.thread])]
        : [],
    run: (self, key) =>
      Effect.gen(function* () {
        const agent = yield* Agent;
        const [folder, thread] = JSON.parse(key) as [string, string];
        while (true) {
          yield* agent.watch(thread).pipe(
            Stream.runForEach((messages) =>
              self.send({ _tag: 'Watched', ...turnsOf(messages) }),
            ),
            Effect.ignore,
          );
          const known = yield* agent.threads(folder, THREAD_KIND).pipe(
            Effect.map((threads) => threads.some(({ id }) => id === thread)),
            Effect.orElseSucceed(() => true),
          );
          if (!known) return yield* self.send({ _tag: 'Lost' });
          yield* Effect.sleep(RETRY);
        }
      }),
  },
};
