import { Context, Effect, Fiber, Layer, type Scope, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { Runtime } from '@kestack/kabuki';
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
import {
  agent,
  agentOver,
  type AgentMessage,
  type AgentModel,
  type AgentOptions,
} from '../index.js';

/*
 * The Agent fake as connect's code Plugin sees it: Claude Code and Codex
 * installed and signed in, as `Harnesses`, `HarnessHost`, `Models` and
 * `OneShotPrompt` answer, and each Script plays as records the real
 * projections draw.
 */

type Fake = Runtime<typeof agent.actor>;
type Edges = Context.Context<Harnesses | HarnessHost | Models | OneShotPrompt>;

const DEFAULT = HarnessAccount.layerDefault;

/** The Agent fake running at no pace unless given, and its edges. */
const run = <A, E>(
  body: (fake: Fake, edges: Edges) => Effect.Effect<A, E, Scope.Scope>,
  options: AgentOptions = {},
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fake = yield* Runtime.scoped(agent.actor);
        const edges = yield* Layer.build(
          agentOver(fake, { paceMs: 0, ...options }),
        );
        return yield* body(fake, edges);
      }),
    ),
  );

const control = (fake: Fake, message: AgentMessage) =>
  Effect.sync(() => void fake.root.send(message));

const until = (fake: Fake, test: (model: AgentModel) => boolean) =>
  Effect.orDie(fake.root.until(({ model }) => test(model)));

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
  it('echoes by default, and shows each running reply in its Model', async () => {
    const found = await run(
      (fake, edges) =>
        Effect.gen(function* () {
          const claude = yield* opened(edges, 'claude');
          const agents = fake.root.model.agents.map(({ harness }) => harness);
          const fiber = yield* Effect.forkChild(say(claude, 'hello'));
          const running = (yield* until(
            fake,
            (model) => model.replies.length > 0,
          )).model.replies.map(({ prompt, script }) => [prompt, script]);
          const outs = yield* Fiber.join(fiber);
          return {
            agents,
            running,
            text: partsOf(harnessOf(edges, 'claude'), outs)
              .flatMap((part) => (part.type === 'textChunk' ? [part.text] : []))
              .join(''),
            end: lastOf(outs),
            after: fake.root.model.replies.length,
          };
        }),
      { paceMs: 20 },
    );
    expect(found.agents).toEqual(['claude']);
    expect(found.running).toEqual([['hello', 'echo']]);
    expect(found.text).toBe('echo: hello');
    expect(found.end).toMatchObject({
      _tag: 'TurnEnd',
      status: 'done',
      shown: true,
    });
    expect(found.after).toBe(0);
  });

  it.each(['claude', 'codex'] as const)(
    'plays every tool kind as %s writes it, through its real projection',
    async (name) => {
      const parts = await run((fake, edges) =>
        Effect.gen(function* () {
          yield* control(fake, { _tag: 'ReplyWith', script: 'every tool' });
          const outs = yield* say(yield* opened(edges, name), 'go');
          return partsOf(harnessOf(edges, name), outs);
        }),
      );
      const kinds = new Set(
        parts.flatMap((part) => (part.type === 'toolCall' ? [part.tool] : [])),
      );
      for (const kind of [
        'read',
        'write',
        'edit',
        'bash',
        'web',
        'mcp',
        'other',
      ])
        expect(kinds).toContain(kind);
      // Codex searches with its shell, and deletes as a file change.
      expect(kinds.has('search')).toBe(name === 'claude');
      expect(kinds.has('delete')).toBe(name === 'codex');
      const results = parts.flatMap((part) =>
        part.type === 'toolResult' ? [part] : [],
      );
      expect(results.some((result) => result.isError)).toBe(true);
      expect(results.some((result) => result.truncated)).toBe(true);
      if (name === 'claude')
        expect(results.some((result) => result.images?.length === 7)).toBe(
          true,
        );
      expect(parts.at(-1)).toMatchObject({ type: 'turnEnded', status: 'done' });
    },
  );

  it.each(['claude', 'codex'] as const)(
    'streams words and reasoning in chunks (%s)',
    async (name) => {
      const parts = await run((fake, edges) =>
        Effect.gen(function* () {
          yield* control(fake, { _tag: 'ReplyWith', script: 'words' });
          const outs = yield* say(yield* opened(edges, name), 'go');
          return partsOf(harnessOf(edges, name), outs);
        }),
      );
      const chunks = parts.flatMap((part) =>
        part.type === 'textChunk' ? [part] : [],
      );
      expect(
        chunks.filter(({ channel }) => channel === 'text').length,
      ).toBeGreaterThan(2);
      expect(chunks.some(({ channel }) => channel === 'reasoning')).toBe(true);
      expect(
        chunks
          .filter(({ channel }) => channel === 'text')
          .map(({ text }) => text)
          .join(''),
      ).toContain('## What changes');
    },
  );

  it.each(['claude', 'codex'] as const)(
    "draws a subagent's subagent under its own call (%s)",
    async (name) => {
      const parts = await run((fake, edges) =>
        Effect.gen(function* () {
          yield* control(fake, { _tag: 'ReplyWith', script: 'subagent' });
          const outs = yield* say(yield* opened(edges, name), 'go');
          return partsOf(harnessOf(edges, name), outs);
        }),
      );
      const spawns = parts.flatMap((part) =>
        part.type === 'toolCall' && part.tool === 'subagent' ? [part] : [],
      );
      expect(spawns).toHaveLength(2);
      const [outer, inner] = spawns;
      expect(outer!.agentId).toBeNull();
      expect(inner!.agentId).toBe(outer!.id);
      expect(parts.some((part) => part.agentId === inner!.id)).toBe(true);
      const reports = parts.flatMap((part) =>
        part.type === 'toolResult' && part.toolCallId === outer!.id
          ? [part.output]
          : [],
      );
      expect(reports.join('')).toContain('One test fails');
    },
  );

  it.each(['claude', 'codex'] as const)(
    'waits on a question until it is answered (%s)',
    async (name) => {
      const found = await run((fake, edges) =>
        Effect.gen(function* () {
          yield* control(fake, { _tag: 'ReplyWith', script: 'question' });
          const open = yield* opened(edges, name);
          const fiber = yield* Effect.forkChild(say(open, 'go'));
          const questions = yield* open.questions.pipe(
            Stream.filter((asked) => asked.length > 0),
            Stream.runHead,
          );
          const question =
            questions._tag === 'Some' ? questions.value[0]! : undefined;
          const waiting = fiber.pollUnsafe() === undefined;
          const [first, second] = question!.items;
          yield* open.answer(question!.id, {
            [first!.id]: ['SQLite'],
            [second!.id]: ['Tests'],
          });
          const outs = yield* Fiber.join(fiber);
          const late = yield* Effect.flip(open.answer(question!.id, null));
          return {
            items: question!.items.length,
            waiting,
            parts: partsOf(harnessOf(edges, name), outs),
            late: late._tag,
            end: lastOf(outs),
          };
        }),
      );
      expect(found.items).toBe(2);
      expect(found.waiting).toBe(true);
      expect(found.parts.some((part) => part.type === 'questionAnswered')).toBe(
        true,
      );
      expect(
        found.parts
          .flatMap((part) => (part.type === 'textChunk' ? [part.text] : []))
          .join(''),
      ).toContain('Store: SQLite');
      expect(found.late).toBe('QuestionNotAsked');
      expect(found.end).toMatchObject({ _tag: 'TurnEnd', status: 'done' });
    },
  );

  it.each([
    ['claude', 'Claude Code stopped with exit code 137'],
    ['codex', 'Codex was stopped by SIGKILL'],
  ] as const)(
    'cut off, %s fails its stream as its process exiting does',
    async (name, why) => {
      const found = await run((fake, edges) =>
        Effect.gen(function* () {
          const open = yield* opened(edges, name);
          yield* control(fake, { _tag: 'ReplyWith', script: 'cut off' });
          return yield* Effect.flip(say(open, 'go'));
        }),
      );
      expect(found.message).toBe(why);
    },
  );

  it('fails as the script says', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'codex');
        yield* control(fake, { _tag: 'ReplyWith', script: 'fails' });
        const outs = yield* say(open, 'go');
        return {
          end: lastOf(outs),
          drawn: partsOf(harnessOf(edges, 'codex'), outs).at(-1),
        };
      }),
    );
    expect(found.end).toMatchObject({
      status: 'failed',
      error: 'API Error: 529 Overloaded',
    });
    expect(found.drawn).toMatchObject({
      type: 'turnEnded',
      status: 'failed',
      error: 'API Error: 529 Overloaded',
    });
  });

  it('ends cancelled once stopped', async () => {
    const found = await run(
      (fake, edges) =>
        Effect.gen(function* () {
          const open = yield* opened(edges, 'claude');
          yield* control(fake, { _tag: 'ReplyWith', script: 'long' });
          const fiber = yield* Effect.forkChild(say(open, 'go'));
          yield* until(fake, (model) => model.replies.length > 0);
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
    const found = await run((_, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'claude', {
          binary: undefined,
          configFolder: '~/.claude-work',
        });
        const outs = yield* say(open, 'go');
        return {
          end: lastOf(outs),
          drawn: partsOf(harnessOf(edges, 'claude'), outs).at(-1),
        };
      }),
    );
    expect(found.end).toMatchObject({
      status: 'failed',
      error: 'Not logged in · Please run /login',
    });
    expect(found.drawn).toMatchObject({ type: 'turnEnded', status: 'failed' });
  });

  it('takes a steer between two steps', async () => {
    const outs = await run(
      (fake, edges) =>
        Effect.gen(function* () {
          const open = yield* opened(edges, 'claude');
          yield* control(fake, { _tag: 'ReplyWith', script: 'long' });
          const turn = open.turn({ text: 'go', images: [] });
          const fiber = yield* Effect.forkChild(collect(turn));
          yield* until(fake, (model) => model.replies.length > 0);
          yield* turn.steer('steer-1', { text: 'also docs', images: [] });
          return yield* Fiber.join(fiber);
        }),
      { paceMs: 5 },
    );
    expect(outs).toContainEqual({ _tag: 'TurnSteered', id: 'steer-1' });
    expect(lastOf(outs)).toMatchObject({ status: 'done' });
  });

  it('runs an Agent on the model and settings its latest Turn names', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'claude');
        const agentNow = () => {
          const [one] = fake.root.model.agents;
          return { model: one?.model, settings: one?.settings };
        };
        const opening = agentNow();
        yield* say(open, 'first');
        const kept = agentNow();
        yield* collect(
          open.turn({
            text: 'second',
            images: [],
            model: 'claude-sonnet-5',
            settings: { effort: 'low' },
          }),
        );
        return { opening, kept, changed: agentNow() };
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

describe('the Agent fake, Background Jobs', () => {
  it("lists a reply's jobs, follows their output, and reports each end", async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'claude');
        yield* control(fake, { _tag: 'ReplyWith', script: 'background jobs' });
        yield* say(open, 'go');
        const jobs = yield* open.backgroundJobs.pipe(
          Stream.filter((list) => list.length === 2),
          Stream.runHead,
        );
        const [shell, helper] = jobs._tag === 'Some' ? jobs.value : [];
        const output = yield* Effect.forkChild(
          Stream.runCollect(open.backgroundJobOutput(shell!.id)),
        );
        yield* open.stopBackgroundJob(helper!.id);
        const refused = yield* Effect.flip(open.stopBackgroundJob('none'));
        // The shell job's time is up.
        yield* TestClock.adjust('8 seconds');
        const ended = yield* open.between.pipe(
          Stream.take(2),
          Stream.runCollect,
        );
        const report = yield* open.agentTurns.pipe(Stream.runHead);
        const reportOuts =
          report._tag === 'Some' ? yield* collect(report.value) : [];
        return {
          kinds: jobs._tag === 'Some' ? jobs.value.map(({ kind }) => kind) : [],
          output: [...(yield* Fiber.join(output))].join(''),
          refused: refused.message,
          ended: partsOf(harnessOf(edges, 'claude'), [...ended]),
          report: partsOf(harnessOf(edges, 'claude'), reportOuts)
            .flatMap((part) => (part.type === 'textChunk' ? [part.text] : []))
            .join(''),
          left: fake.root.model.jobs.length,
        };
      }).pipe(Effect.provide(TestClock.layer())),
    );
    expect(found.kinds).toEqual(['shell', 'agent']);
    expect(found.output).toContain('localhost:5173');
    expect(found.refused).toBe('No Background Job none');
    expect(found.ended).toEqual([
      expect.objectContaining({ type: 'jobEnded', status: 'stopped' }),
      expect.objectContaining({ type: 'jobEnded', status: 'done' }),
    ]);
    expect(found.report).toContain('"pnpm dev" finished');
    expect(found.left).toBe(0);
  });

  it('a reload keeps the world, not what ran in it', async () => {
    const kept = await run((fake, edges) =>
      Effect.gen(function* () {
        yield* opened(edges, 'claude');
        yield* control(fake, { _tag: 'ReplyWith', script: 'plan' });
        return agent.kept(fake.snapshot).root.model;
      }),
    );
    expect(kept.agents).toEqual([]);
    expect(kept.replyWith).toBe('plan');
  });
});
