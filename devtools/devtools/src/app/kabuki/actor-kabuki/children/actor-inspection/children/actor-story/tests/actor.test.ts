import { Effect, Layer, Option, Stream } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import type { DataOf } from '@kestack/kabuki/types';
import { KabukiSession } from '@kestack/devtools-kabuki/devtools';
import type {
  KabukiSessionCalls,
  Node,
  Plan,
  Told,
} from '@kestack/devtools-kabuki/devtools';
import { fakeAgent } from '../../../../../../../services/agent/fake/index.js';
import type { Reply } from '../../../../../../../services/agent/fake/index.js';
import { Preferences } from '../../../../../../../services/preferences/contract/index.js';
import { fakePreferences } from '../../../../../../../services/preferences/fake/index.js';
import type { Worktree } from '../../../../../../../services/project-registry/contract/index.js';
import { fakeProjectRegistry } from '../../../../../../../services/project-registry/fake/index.js';
import { Story } from '../index.js';
import {
  Remembered,
  failureOf,
  worktreesOf,
} from '../../../logic/shared/index.js';
import { StoryShape, stageOf, focusOf } from '../logic/shared/index.js';
import { SYSTEM, treeOf } from '../logic/updates.js';
import { plan } from './plan.js';

const PROJECT = '/code/todo';
const FOLDER = '/code/todo';
const WORKTREE = '/code/todo-wip';

const worktrees = {
  [PROJECT]: [
    {
      folder: PROJECT,
      branch: 'main',
      head: 'aaaaaaaaaa',
      primary: true,
      current: true,
    },
    {
      folder: WORKTREE,
      branch: null,
      head: 'bbbbbbbbbb',
      primary: false,
      current: false,
    },
  ],
};

const node = (address: string, children: ReadonlyArray<Node> = []): Node => ({
  address,
  actor: address,
  slot: null,
  state: 'Single',
  data: {},
  model: {},
  workers: [],
  provides: [],
  children,
});

const told: Told = {
  now: {
    head: 1,
    previewing: null,
    running: true,
    failure: null,
    url: '',
    revision: 1,
  },
  epoch: 'one',
  entries: [],
  roots: [],
};

const session = (blueprint: Plan = plan) =>
  Layer.succeed(KabukiSession)({
    history: () => Stream.make(told),
    step: () =>
      Effect.succeed({
        at: 1,
        tree: node('App', [
          node('App/Ready:list#1', [node('App/Ready:list#1/items[a]#1')]),
        ]),
        message: null,
        changes: [],
      }),
    blueprint: () => Effect.succeed(blueprint),
  } as unknown as KabukiSessionCalls);

const answer = {
  title: 'How a to-do is ticked',
  beats: [
    {
      say: 'The app is **Ready**.',
      focus: 'App',
      show: [{ actor: 'App', lit: ['description', 'state:Ready'] }],
    },
    {
      say: 'The list places one Item per to-do.',
      focus: 'App/Ready:list',
      show: [
        { actor: 'App', lit: ['state:Ready', 'child:list'] },
        { actor: 'App/Ready:list', lit: ['child:items'] },
        { actor: 'App/Ready:list/items', lit: ['props'] },
      ],
      links: [
        { from: 'App/Ready:list', to: 'App/Ready:list/items', label: 'done' },
      ],
    },
    {
      say: 'An actor that is not there.',
      focus: 'App/Gone',
      show: [{ actor: 'App/Gone', lit: [] }],
    },
  ],
};

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
    const app = yield* Runtime.scoped(Story, {
      input: { app: 'Todo' },
      layer: Layer.mergeAll(
        agent.layer,
        session(),
        Layer.succeed(Preferences)(preferences),
        fakeProjectRegistry(
          [{ id: '1', name: 'todo', path: PROJECT }],
          worktrees,
        ),
      ),
    });
    yield* settle;
    return {
      agent,
      app,
      story: () =>
        app.snapshot.root as unknown as DataOf<typeof StoryShape> & {
          readonly state: unknown;
        },
    };
  });

const opened = (replies: ReadonlyArray<Reply>) =>
  Effect.gen(function* () {
    const started = yield* start(replies);
    started.app.root.send({ _tag: 'Chose', project: PROJECT });
    yield* settle;
    return started;
  });

describe('Story', () => {
  it('asks for the Project until one is picked, opens its current Worktree, and remembers both for the app', () =>
    run(
      Effect.gen(function* () {
        const preferences = fakePreferences();
        const first = yield* start([], preferences);
        expect(first.story().state).toEqual({ _tag: 'Choice' });
        expect(first.story().model).toMatchObject({
          projects: [{ name: 'todo', path: PROJECT }],
          plan,
          live: ['App', 'App/Ready:list', 'App/Ready:list/items'],
        });
        first.app.root.send({ _tag: 'Chose', project: PROJECT });
        yield* settle;
        expect(first.story().state).toEqual({
          _tag: 'Open',
          project: PROJECT,
          folder: PROJECT,
        });
        const open = first.story() as DataOf<typeof StoryShape, 'Open'>;
        expect(worktreesOf(open.state.folder, open.model.worktrees)).toEqual([
          { folder: PROJECT, label: 'main' },
          { folder: WORKTREE, label: 'detached @bbbbbbb' },
        ]);

        first.app.root.send({ _tag: 'Switched', folder: WORKTREE });
        first.app.root.send({ _tag: 'Switched', folder: '/somewhere/else' });
        yield* settle;
        expect(first.story().state).toEqual({
          _tag: 'Open',
          project: PROJECT,
          folder: WORKTREE,
        });
        expect(
          Option.getOrNull(
            yield* preferences.load('kabuki:story:Todo', Remembered),
          ),
        ).toEqual({ project: PROJECT, folder: WORKTREE, thread: null });

        const again = yield* start([], preferences);
        expect(again.story().state).toEqual({
          _tag: 'Open',
          project: PROJECT,
          folder: WORKTREE,
        });
      }),
    ));

  it('says why the Worktrees could not be read, and reads them again on Try again', () =>
    run(
      Effect.gen(function* () {
        const listed: Record<
          string,
          ReadonlyArray<Worktree> | { readonly failed: string }
        > = {
          [PROJECT]: { failed: 'git is gone' },
        };
        const agent = yield* fakeAgent([]);
        const app = yield* Runtime.scoped(Story, {
          input: { app: 'Todo' },
          layer: Layer.mergeAll(
            agent.layer,
            session(),
            Layer.succeed(Preferences)(fakePreferences()),
            fakeProjectRegistry(
              [{ id: '1', name: 'todo', path: PROJECT }],
              listed,
            ),
          ),
        });
        yield* settle;
        app.root.send({ _tag: 'Chose', project: PROJECT });
        yield* settle;
        const story = () =>
          app.snapshot.root as unknown as DataOf<typeof StoryShape>;
        expect(story().model).toMatchObject({
          worktrees: null,
          worktreesProblem: 'git is gone',
        });
        Object.assign(listed, worktrees);
        app.root.send({ _tag: 'WorktreesRelisted' });
        yield* settle;
        expect(story().model).toMatchObject({
          worktrees: worktrees[PROJECT],
          worktreesProblem: null,
        });
      }),
    ));

  it('keeps what is explored by hand while the first answer is still coming', () =>
    run(
      Effect.gen(function* () {
        const { app, story } = yield* opened([]);
        app.root.send({
          _tag: 'Toggled',
          actor: 'App',
          ref: 'message:Loaded',
        });
        app.root.send({ _tag: 'Asked', question: 'How?' });
        yield* settle;
        expect(story().model.run).toMatchObject({ status: 'running' });
        expect(story().model.explore).toEqual([
          { actor: 'App', lit: ['message:Loaded'] },
        ]);
      }),
    ));

  it('asks with the Blueprint and its Beats schema, then plays the answer from its first Beat', () =>
    run(
      Effect.gen(function* () {
        const { agent, app, story } = yield* opened([
          { data: answer, activity: ['Reading src/app.tsx'] },
        ]);
        app.root.send({ _tag: 'Chipped', chip: 'App/Ready:list · workers' });
        app.root.send({ _tag: 'Asked', question: 'How is a to-do ticked?' });
        yield* settle;

        const [asked] = agent.asked;
        expect(asked).toMatchObject({ folder: FOLDER, system: SYSTEM });
        expect(asked!.prompt).toContain(
          'How is a to-do ticked?\nAbout: App/Ready:list · workers',
        );
        expect(asked!.prompt).toContain(treeOf(plan));
        expect(JSON.stringify(asked!.schema)).toContain('App/Ready:list/items');

        const now = story();
        expect(now.model).toMatchObject({
          thread: expect.any(String),
          chips: [],
          pending: null,
          at: { turn: 0, beat: 0 },
          playing: false,
          run: { status: 'done' },
          turns: [
            {
              question: 'How is a to-do ticked?',
              chips: ['App/Ready:list · workers'],
              answer,
            },
          ],
        });
        expect(now.model.threads).toEqual([
          expect.objectContaining({ title: 'How a to-do is ticked' }),
        ]);
        const focus = focusOf(now)!;
        expect(focus).toMatchObject({ index: 0, of: 3 });
        expect(focus.picture.missing).toEqual([]);
        expect([...focus.picture.cards.get('App')!.open]).toEqual([
          'state:Ready',
        ]);
      }),
    ));

  it('steps through the Beats, and marks the one whose actor is not in the Blueprint as not found', () =>
    run(
      Effect.gen(function* () {
        const { app, story } = yield* opened([{ data: answer }]);
        app.root.send({ _tag: 'Asked', question: 'How?' });
        yield* settle;
        app.root.send({ _tag: 'Stepped', by: 1 });
        yield* settle;
        const second = focusOf(story())!;
        expect(second.index).toBe(1);
        expect([...second.picture.cards.keys()]).toEqual([
          'App',
          'App/Ready:list',
          'App/Ready:list/items',
        ]);
        expect(second.picture.links).toMatchObject([
          { to: { path: 'App/Ready:list/items' }, label: 'done' },
        ]);
        app.root.send({ _tag: 'Stepped', by: 1 });
        app.root.send({ _tag: 'Stepped', by: 1 });
        yield* settle;
        const last = focusOf(story())!;
        expect(last.index).toBe(2);
        expect(last.picture.focus).toBeNull();
        expect(last.picture.missing).toEqual(['App/Gone']);

        app.root.send({ _tag: 'Played', playing: true });
        yield* settle;
        expect(story().model).toMatchObject({
          playing: true,
          at: { turn: 0, beat: 0 },
        });
      }),
    ));

  it('leaves the story for Explore mode on a card, from the Beat it is on, and goes back to it', () =>
    run(
      Effect.gen(function* () {
        const { app, story } = yield* opened([{ data: answer }]);
        app.root.send({ _tag: 'Asked', question: 'How?' });
        yield* settle;
        app.root.send({ _tag: 'Played', playing: true });
        app.root.send({ _tag: 'Toggled', actor: 'App', ref: 'worker:load' });
        yield* settle;
        expect(stageOf(story()).mode).toBe('explore');
        expect(story().model).toMatchObject({
          playing: false,
          at: { turn: 0, beat: 0 },
          explore: [
            {
              actor: 'App',
              lit: ['description', 'state:Ready', 'state:Loading/worker:load'],
            },
          ],
        });

        app.root.send({ _tag: 'Toggled', actor: 'App', ref: 'nope' });
        app.root.send({
          _tag: 'Folded',
          actor: 'App/Ready:list',
          fold: 'state:Open',
        });
        app.root.send({ _tag: 'Toggled', actor: 'App', ref: 'state:Ready' });
        app.root.send({
          _tag: 'Toggled',
          actor: 'App/Ready:list',
          ref: 'message:Toggled.id',
        });
        yield* settle;
        expect(story().model.explore).toEqual([
          { actor: 'App', lit: ['description', 'state:Loading/worker:load'] },
          { actor: 'App/Ready:list', lit: ['message:Toggled.id'] },
        ]);

        app.root.send({ _tag: 'Folded', actor: 'App', fold: 'state:Loading' });
        app.root.send({ _tag: 'Folded', actor: 'App', fold: 'state:Ready' });
        app.root.send({ _tag: 'Folded', actor: 'App', fold: 'messages' });
        yield* settle;
        const card = stageOf(story()).picture.cards.get('App')!;
        expect([...card.open]).toEqual([
          'state:Loading/workers',
          'state:Ready',
          'messages',
        ]);
        expect(story().model.explore![0]).toMatchObject({
          open: ['state:Loading/workers', 'state:Ready', 'messages'],
        });

        app.root.send({ _tag: 'Returned' });
        yield* settle;
        expect(stageOf(story()).mode).toBe('story');
        app.root.send({ _tag: 'Explored' });
        yield* settle;
        expect(stageOf(story()).mode).toBe('explore');
        app.root.send({ _tag: 'Jumped', turn: 0, beat: 1 });
        yield* settle;
        expect(stageOf(story())).toMatchObject({
          mode: 'story',
          focus: { index: 1 },
        });
        expect(story().model.explore).toBeNull();
      }),
    ));

  it('follows up with only the question and its chips while the Blueprint is the same', () =>
    run(
      Effect.gen(function* () {
        const { agent, app } = yield* opened([
          { data: answer },
          { data: answer },
        ]);
        app.root.send({ _tag: 'Asked', question: 'How?' });
        yield* settle;
        app.root.send({ _tag: 'Chipped', chip: 'App' });
        app.root.send({ _tag: 'Asked', question: 'And then?' });
        yield* settle;
        expect(agent.asked.map(({ prompt }) => prompt)).toEqual([
          expect.stringContaining(treeOf(plan)),
          'And then?\nAbout: App',
        ]);
        expect(agent.asked[1]!.thread).toBe(agent.asked[0]!.thread);
      }),
    ));

  it('says why an answer failed, and Retry asks the same question again with the whole Blueprint', () =>
    run(
      Effect.gen(function* () {
        const { agent, app, story } = yield* opened([
          { failed: 'Claude Code is not signed in.' },
          { data: answer },
        ]);
        app.root.send({ _tag: 'Asked', question: 'How?' });
        yield* settle;
        expect(story().model.run).toMatchObject({ status: 'failed' });
        expect(
          failureOf(
            story().model.pending,
            story().model.problem,
            story().model.run,
          ),
        ).toBe('Claude Code is not signed in.');

        app.root.send({ _tag: 'Retried' });
        yield* settle;
        expect(agent.asked).toHaveLength(2);
        expect(agent.asked[1]!.prompt).toContain('How?');
        expect(agent.asked[1]!.prompt).toContain(treeOf(plan));
        expect(story().model).toMatchObject({
          run: { status: 'done' },
          at: { turn: 1, beat: 0 },
        });
        expect(
          failureOf(
            story().model.pending,
            story().model.problem,
            story().model.run,
          ),
        ).toBeNull();
      }),
    ));

  it('stops an answer that is still coming', () =>
    run(
      Effect.gen(function* () {
        const { app, story } = yield* opened([]);
        app.root.send({ _tag: 'Asked', question: 'How?' });
        yield* settle;
        expect(story().model.run).toMatchObject({ status: 'running' });
        app.root.send({ _tag: 'Asked', question: 'Again?' });
        app.root.send({ _tag: 'Stopped' });
        yield* settle;
        expect(story().model.run).toMatchObject({ status: 'cancelled' });
        expect(story().model.turns).toHaveLength(1);
        expect(
          failureOf(
            story().model.pending,
            story().model.problem,
            story().model.run,
          ),
        ).toBe('Stopped before it answered.');
      }),
    ));

  it('opens a new Thread, and an older one again', () =>
    run(
      Effect.gen(function* () {
        const { app, story } = yield* opened([{ data: answer }]);
        app.root.send({ _tag: 'Asked', question: 'How?' });
        yield* settle;
        const thread = story().model.thread;
        app.root.send({ _tag: 'Opened', thread: null });
        yield* settle;
        expect(story().model).toMatchObject({
          thread: null,
          turns: [],
          at: null,
        });
        app.root.send({ _tag: 'Opened', thread });
        yield* settle;
        expect(story().model).toMatchObject({
          thread,
          at: { turn: 0, beat: 0 },
          turns: [{ answer }],
        });
      }),
    ));
});
