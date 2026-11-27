import { Cause, Effect, Option, Stream } from 'effect';
import { Address } from '@kestack/kabuki';
import type { Address as Of } from '@kestack/kabuki';
import type { WorkersOf } from '@kestack/kabuki/types';
import { KabukiSession } from '@kestack/devtools-kabuki/devtools';
import type { Node } from '@kestack/devtools-kabuki/devtools';
import { Agent } from '../../../../../../../services/agent/contract/index.js';
import { Preferences } from '../../../../../../../services/preferences/contract/index.js';
import { ProjectRegistry } from '../../../../../../../services/project-registry/contract/index.js';
import { Remembered, storyKeyOf } from '../../../logic/shared/index.js';
import { THREAD_KIND, beatsOf, titleOf, turnsOf } from './shared/index.js';
import type { StoryShape } from './shared/index.js';

const SETTLE = '250 millis';

const RETRY = '2 seconds';

const WORD = 280;
const LEAST = 2500;
const MOST = 12000;

export const durationOf = (say: string) =>
  Math.min(
    MOST,
    Math.max(LEAST, 1200 + say.split(/\s+/).filter(Boolean).length * WORD),
  );

const placesOf = (node: Node): ReadonlyArray<string> => [
  Address.place(node.address as Of),
  ...node.children.flatMap(placesOf),
];

export const workers: WorkersOf<typeof StoryShape> = {
  recall: {
    while: ({ state }) => state._tag === 'Recall',
    run: (self) =>
      Effect.gen(function* () {
        const preferences = yield* Preferences;
        const { model } = yield* self.get;
        const saved = yield* preferences.load(
          storyKeyOf(model.app),
          Remembered,
        );
        yield* self.send({
          _tag: 'Recalled',
          remembered: Option.getOrNull(saved),
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
          storyKeyOf(model.app),
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
  plan: {
    while: ({ model }) => model.plan === null && model.planProblem === null,
    run: (self) =>
      Effect.flatMap(KabukiSession, (session) => session.blueprint()).pipe(
        Effect.map((plan) => ({ _tag: 'Planned' as const, plan })),
        Effect.catchCause((cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
          const error = Cause.squash(cause);
          return Effect.succeed({
            _tag: 'PlanRefused' as const,
            problem: `The app's Blueprint could not be read: ${error instanceof Error ? error.message : String(error)}`,
          });
        }),
        Effect.flatMap((message) => self.send(message)),
      ),
  },
  live: {
    while: ({ props }) => props?.shown !== false,
    run: (self) =>
      Effect.gen(function* () {
        const session = yield* KabukiSession;
        yield* session.history({}).pipe(
          Stream.debounce(SETTLE),
          Stream.mapEffect(() => Effect.option(session.step({}))),
          Stream.runForEach((stepped) =>
            Option.isNone(stepped)
              ? Effect.void
              : self.send({
                  _tag: 'Lived',
                  paths: [...new Set(placesOf(stepped.value.tree))].sort(),
                }),
          ),
          Effect.ignore,
        );
      }),
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
        const listed = yield* Effect.forEach(
          threads,
          (thread) =>
            agent.watch(thread.id).pipe(
              Stream.runHead,
              Effect.map((messages) => ({
                id: thread.id,
                createdAt: thread.createdAt,
                title: titleOf(
                  turnsOf(Option.getOrElse(messages, () => [])).turns,
                ),
              })),
            ),
          { concurrency: 'unbounded' },
        );
        yield* self.send({ _tag: 'Threaded', threads: listed });
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
  play: {
    each: ({ state, model }) => {
      if (state._tag !== 'Open' || !model.playing || model.explore !== null)
        return [];
      return model.at === null ? [] : [`${model.at.turn}:${model.at.beat}`];
    },
    run: (self) =>
      Effect.gen(function* () {
        const { model } = yield* self.get;
        if (model.at === null) return;
        const beat = beatsOf(model.turns, model.at.turn)[model.at.beat];
        yield* Effect.sleep(durationOf(beat?.say ?? ''));
        yield* self.send({ _tag: 'Advanced' });
      }),
  },
};
