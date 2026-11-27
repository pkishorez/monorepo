import {
  Context,
  Effect,
  Fiber,
  Layer,
  Option,
  type Scope,
  Stream,
} from 'effect';
import { FakeWorld } from '@kestack/kabuki/fake';
import { describe, expect, it } from 'vitest';
import type { Part } from '../../../contract/projection/index.js';
import type { HarnessName, Raw } from '../../../contract/raw/index.js';
import {
  HarnessAccount,
  Harnesses,
  HarnessHost,
  isRecord,
  Models,
  OneShotPrompt,
  type Agent,
  type Harness,
  type TurnHandle,
  type TurnOut,
} from '../../contract/index.js';
import { agent, type AgentOptions, type AgentState } from '../index.js';
import { RECORDINGS, recordingFor } from '../recordings/index.js';

/*
 * The Agent fake as connect's code Plugin sees it: Claude Code and Codex
 * installed and signed in, as `Harnesses`, `HarnessHost`, `Models` and
 * `OneShotPrompt` answer, and each reply replays a recorded Turn the real
 * projections draw. What a reply replays is its one control.
 */

const worldOf = (options: AgentOptions = {}) =>
  FakeWorld.make([agent({ paceMs: 0, ...options })]);
type World = ReturnType<typeof worldOf>;
type Edges = Context.Context<Harnesses | HarnessHost | Models | OneShotPrompt>;

const DEFAULT = HarnessAccount.layerDefault;

/** The Agent fake's world started, at no pace unless given, and its edges. */
const run = <A, E>(
  body: (world: World, edges: Edges) => Effect.Effect<A, E, Scope.Scope>,
  options: AgentOptions = {},
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const world = worldOf(options);
        const edges = yield* Layer.build(world.layer);
        return yield* body(world, edges);
      }),
    ),
  );

/** Every reply from now on replays `recording`. */
const replyWith = (world: World, recording: string) =>
  world.control('agent', 'ReplyWith', { recording });

/** The fake's state once it passes `test`. */
const stateOf = (
  world: World,
  test: (state: AgentState) => boolean = () => true,
) =>
  world.fakes.pipe(
    Stream.map((fakes) => fakes[0]!.value as AgentState),
    Stream.filter(test),
    Stream.runHead,
    Effect.map(Option.getOrThrow),
  );

const harnessOf = (edges: Edges, name: HarnessName) =>
  Context.get(edges, Harnesses).get(name);

const opened = (
  edges: Edges,
  name: HarnessName,
  account: HarnessAccount['Service'] = {
    binary: undefined,
    configFolder: undefined,
  },
) =>
  harnessOf(edges, name)
    .open({ cwd: '/home/you/app', model: 'm', settings: {} })
    .pipe(Effect.provideService(HarnessAccount, account));

/** Every record and fact of a turn, until it ends. */
const collect = (turn: TurnHandle) =>
  Stream.runCollect(turn.out).pipe(Effect.map((outs) => [...outs]));

/** The parts the real projection draws from a turn's records. */
const partsOf = (
  harness: Harness,
  outs: ReadonlyArray<TurnOut>,
): ReadonlyArray<Part & { readonly agentId: string | null }> =>
  outs.filter(isRecord).flatMap((out) => {
    const raw: Raw = {
      id: 'raw',
      sessionId: 'session',
      turnId: 'turn',
      harness: harness.name,
      kind: out.kind,
      agentId: out.agentId ?? null,
      payload: out.payload,
      at: 0,
    };
    const projected = harness.project(raw);
    return (projected?.parts ?? []).map((part) => ({
      ...part,
      agentId: projected!.agentId,
    }));
  });

const lastOf = (outs: ReadonlyArray<TurnOut>) => outs.at(-1);

const say = (agentOpen: Agent, text: string) =>
  collect(agentOpen.turn({ text, images: [] }));

describe('the Agent fake, its world', () => {
  it('runs both harnesses from PATH, and no binary elsewhere', async () => {
    const found = await run((_, edges) =>
      Effect.gen(function* () {
        const host = Context.get(edges, HarnessHost);
        const account = { binary: undefined, configFolder: undefined };
        return {
          claude: yield* host.binaryAt(harnessOf(edges, 'claude'), account),
          codex: yield* host.binaryAt(harnessOf(edges, 'codex'), account),
          refused: yield* Effect.flip(
            host.checkBinary(harnessOf(edges, 'claude'), '~/bin/claude'),
          ),
        };
      }),
    );
    expect(found.claude).toMatchObject({
      path: '/usr/local/bin/claude',
      error: null,
      isDefault: true,
    });
    expect(found.codex).toMatchObject({
      path: '/usr/local/bin/codex',
      version: 'codex-cli 0.154.0',
    });
    expect(found.refused).toMatchObject({
      _tag: 'InvalidBinary',
      message: 'No file at /home/you/bin/claude',
    });
  });

  it('says which config folder an account uses, and why', async () => {
    const found = await run((_, edges) =>
      Effect.gen(function* () {
        const host = Context.get(edges, HarnessHost);
        return {
          own: yield* host.configFolderOf('claude', undefined),
          given: yield* host.configFolderOf('claude', '~/.claude-work'),
          codex: yield* host.configFolderOf('codex', undefined),
        };
      }),
    );
    expect(found).toEqual({
      own: { path: '/home/you/.claude', from: 'default' },
      given: { path: '/home/you/.claude-work', from: 'account' },
      codex: { path: '/home/you/.codex', from: 'default' },
    });
  });

  it("lists the login's models; models.dev's without a login", async () => {
    const found = await run((_, edges) =>
      Effect.gen(function* () {
        const models = Context.get(edges, Models);
        const claude = harnessOf(edges, 'claude');
        const work = HarnessAccount.of({
          binary: undefined,
          configFolder: '~/.claude-work',
        });
        const ids = (account: HarnessAccount['Service']) =>
          models.list(claude).pipe(
            Effect.provideService(HarnessAccount, account),
            Effect.map((list) => list.map(({ id }) => id)),
          );
        const signedIn = yield* ids({
          binary: undefined,
          configFolder: undefined,
        });
        const other = yield* ids(work);
        return { signedIn, other };
      }),
    );
    expect(found.signedIn).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5',
      'claude-haiku-5-5',
    ]);
    expect(found.other).toContain('claude-opus-4-5');
    expect(found.other).not.toContain('claude-opus-4-5-20251101');
  });

  it('offers its built-in Skills in every folder', async () => {
    const found = await run((_, edges) =>
      harnessOf(edges, 'codex')
        .skills('/home/you/app/web')
        .pipe(
          Effect.provide(DEFAULT),
          Effect.map((skills) => skills.map(({ name }) => name)),
        ),
    );
    expect(found).toEqual(['review', 'explain']);
  });

  it('writes a Title from the message, and a plain Btw answer', async () => {
    const found = await run((_, edges) =>
      Effect.gen(function* () {
        const oneShot = Context.get(edges, OneShotPrompt);
        const title = yield* oneShot.prompt(
          'Write a title\n\n<latest-message>\nadd dark mode to the settings page please\n</latest-message>',
        );
        const btw = yield* harnessOf(edges, 'claude')
          .ask({ cwd: '/', nativeId: 'n', model: 'm', question: 'why?' })
          .pipe(Effect.provide(DEFAULT));
        return { title, btw };
      }),
    );
    expect(found.title).toBe('add dark mode to the');
    expect(found.btw).toMatchObject({ _tag: 'Text' });
    expect(found.btw._tag === 'Text' && found.btw.text).toContain('“why?”');
  });
});

describe('the Agent fake, its replies', () => {
  it('replays the recording the state names, and shows the reply running', async () => {
    const found = await run(
      (world, edges) =>
        Effect.gen(function* () {
          const claude = yield* opened(edges, 'claude');
          yield* replyWith(world, 'read');
          const fiber = yield* Effect.forkChild(say(claude, 'hello'));
          const running = (yield* stateOf(
            world,
            (state) => state.replies.length > 0,
          )).replies.map(({ prompt, recording }) => [prompt, recording]);
          const outs = yield* Fiber.join(fiber);
          return {
            running,
            text: partsOf(harnessOf(edges, 'claude'), outs)
              .flatMap((part) => (part.type === 'text' ? [part.text] : []))
              .join(''),
            end: lastOf(outs),
            after: (yield* stateOf(world)).replies.length,
          };
        }),
      { paceMs: 20 },
    );
    expect(found.running).toEqual([['hello', 'read']]);
    expect(found.text).toContain('PINEAPPLE-42');
    expect(found.end).toMatchObject({
      _tag: 'TurnEnd',
      status: 'done',
      shown: true,
    });
    expect(found.after).toBe(0);
  });

  it.each(RECORDINGS.map(({ harness, name }) => [harness, name] as const))(
    "replays %s's %s as this Agent's own, through its real projection",
    async (name, recording) => {
      const found = await run((world, edges) =>
        Effect.gen(function* () {
          const open = yield* opened(edges, name);
          yield* replyWith(world, recording);
          const outs = yield* say(open, 'go');
          return {
            nativeId: yield* open.nativeId,
            records: JSON.stringify(outs.filter(isRecord)),
            parts: partsOf(harnessOf(edges, name), outs),
            end: lastOf(outs),
          };
        }),
      );
      expect(found.records).toContain(found.nativeId);
      expect(found.records).not.toMatch(/\/var\/folders|\/Users\//);
      expect(found.parts.at(-1)).toMatchObject({
        type: 'turnEnded',
        status: 'done',
      });
      expect(found.end).toMatchObject({ status: 'done', shown: true });
    },
  );

  it("replays one of its own harness's recordings when none is named", () => {
    const codex = RECORDINGS.filter(({ harness }) => harness === 'codex');
    expect(recordingFor('codex', 'random', () => 0)).toBe(codex[0]);
    expect(recordingFor('codex', 'random', () => 0.99)).toBe(codex.at(-1));
    // Claude's only: Codex has no `read`.
    expect(recordingFor('codex', 'read', () => 0).harness).toBe('codex');
  });

  it('ends cancelled once stopped', async () => {
    const found = await run(
      (world, edges) =>
        Effect.gen(function* () {
          const open = yield* opened(edges, 'claude');
          yield* replyWith(world, 'subagent');
          const fiber = yield* Effect.forkChild(say(open, 'go'));
          yield* stateOf(world, (state) => state.replies.length > 0);
          yield* open.cancel;
          return lastOf(yield* Fiber.join(fiber));
        }),
      { paceMs: 20 },
    );
    expect(found).toEqual({
      _tag: 'TurnEnd',
      status: 'cancelled',
      shown: false,
    });
  });

  it("fails every turn with the harness's login error in another config folder", async () => {
    const outs = await run((_, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'claude', {
          binary: undefined,
          configFolder: '~/.claude-work',
        });
        return yield* say(open, 'go');
      }),
    );
    expect(outs).toEqual([
      {
        _tag: 'TurnEnd',
        status: 'failed',
        error: 'Not logged in · Please run /login',
        shown: false,
      },
    ]);
  });

  it('takes a steer between two records', async () => {
    const outs = await run(
      (world, edges) =>
        Effect.gen(function* () {
          const open = yield* opened(edges, 'claude');
          yield* replyWith(world, 'subagent');
          const turn = open.turn({ text: 'go', images: [] });
          const fiber = yield* Effect.forkChild(collect(turn));
          yield* stateOf(world, (state) => state.replies.length > 0);
          yield* turn.steer('steer-1', { text: 'also docs', images: [] });
          return yield* Fiber.join(fiber);
        }),
      { paceMs: 5 },
    );
    expect(outs).toContainEqual({ _tag: 'TurnSteered', id: 'steer-1' });
    expect(lastOf(outs)).toMatchObject({ status: 'done' });
  });

  it('runs an Agent on the model and settings its latest Turn names', async () => {
    const found = await run((world, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'claude');
        const agentNow = Effect.map(stateOf(world), ({ agents: [one] }) => ({
          model: one?.model,
          settings: one?.settings,
        }));
        const opening = yield* agentNow;
        yield* say(open, 'first');
        const kept = yield* agentNow;
        yield* collect(
          open.turn({
            text: 'second',
            images: [],
            model: 'claude-sonnet-5',
            settings: { effort: 'low' },
          }),
        );
        return { opening, kept, changed: yield* agentNow };
      }),
    );
    expect(found.opening).toEqual({ model: 'm', settings: {} });
    expect(found.kept).toEqual({ model: 'm', settings: {} });
    expect(found.changed).toEqual({
      model: 'claude-sonnet-5',
      settings: { effort: 'low' },
    });
  });
});
