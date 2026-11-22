import {
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  type Scope,
  Stream,
} from 'effect';
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
import { agent, type AgentMessage, type AgentModel } from '../index.js';

/*
 * The Agent fake as connect's code Plugin sees it: each Control lands in
 * what `Harnesses`, `HarnessHost`, `Models` and `OneShotPrompt` answer, and
 * each Script plays as records the real projections draw.
 */

type Fake = Runtime<typeof agent.actor>;
type Edges = Context.Context<Harnesses | HarnessHost | Models | OneShotPrompt>;

const DEFAULT = HarnessAccount.layerDefault;

/** The Agent fake running at no pace, and its edges. */
const run = <A, E>(
  body: (fake: Fake, edges: Edges) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fake = yield* Runtime.scoped(agent.actor);
        fake.root.send({ _tag: 'SetPace', ms: 0 });
        const edges = yield* Layer.build(agent.serve(fake));
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

const opened = (edges: Edges, name: HarnessName) =>
  harnessOf(edges, name)
    .open({ cwd: '/home/you/app', model: 'm', settings: {} })
    .pipe(Effect.provide(DEFAULT));

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
  it('runs both harnesses from PATH until one is uninstalled', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const host = Context.get(edges, HarnessHost);
        const account = { binary: undefined, configFolder: undefined };
        const before = yield* host.binaryAt(harnessOf(edges, 'codex'), account);
        yield* control(fake, { _tag: 'Uninstall', harness: 'codex', why: '' });
        const after = yield* host.binaryAt(harnessOf(edges, 'codex'), account);
        yield* control(fake, {
          _tag: 'Uninstall',
          harness: 'claude',
          why: 'Claude Code needs a newer macOS',
        });
        const claude = yield* host.binaryAt(
          harnessOf(edges, 'claude'),
          account,
        );
        const open = yield* Effect.exit(opened(edges, 'claude'));
        return { before, after, claude, open };
      }),
    );
    expect(found.before).toMatchObject({
      path: '/usr/local/bin/codex',
      error: null,
      isDefault: true,
    });
    expect(found.after.error).toMatch(/^Codex is not installed/);
    expect(found.claude.error).toBe('Claude Code needs a newer macOS');
    expect(Exit.isFailure(found.open)).toBe(true);
  });

  it('takes a binary path only once one runs there', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const host = Context.get(edges, HarnessHost);
        const claude = harnessOf(edges, 'claude');
        const refused = yield* Effect.flip(
          host.checkBinary(claude, '~/bin/claude'),
        );
        yield* control(fake, {
          _tag: 'AddBinary',
          harness: 'claude',
          path: '~/bin/claude',
        });
        return {
          refused,
          taken: yield* host.checkBinary(claude, '~/bin/claude'),
        };
      }),
    );
    expect(found.refused._tag).toBe('InvalidBinary');
    expect(found.taken).toBe('/home/you/bin/claude');
  });

  it('says which config folder an account uses, and why', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const host = Context.get(edges, HarnessHost);
        const own = yield* host.configFolderOf('claude', undefined);
        const given = yield* host.configFolderOf('claude', '~/.claude-work');
        yield* control(fake, {
          _tag: 'SetConfigFromEnvironment',
          harness: 'codex',
          folder: '/srv/codex',
        });
        return {
          own,
          given,
          environment: yield* host.configFolderOf('codex', undefined),
        };
      }),
    );
    expect(found).toEqual({
      own: { path: '/home/you/.claude', from: 'default' },
      given: { path: '/home/you/.claude-work', from: 'account' },
      environment: {
        path: '/srv/codex',
        from: 'environment',
        variable: 'CODEX_HOME',
      },
    });
  });

  it("lists the login's models; models.dev's without a login; fails on cue", async () => {
    const found = await run((fake, edges) =>
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
        const otherBefore = yield* ids(work);
        yield* control(fake, {
          _tag: 'SignIn',
          harness: 'claude',
          configFolder: '~/.claude-work',
        });
        const otherAfter = yield* ids(work);
        yield* control(fake, {
          _tag: 'ModelsFail',
          harness: 'claude',
          reason: 'Claude Code could not be asked',
        });
        const failed = yield* Effect.flip(
          models.list(claude).pipe(Effect.provide(DEFAULT)),
        );
        return { signedIn, otherBefore, otherAfter, failed };
      }),
    );
    expect(found.signedIn).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5',
      'claude-haiku-5-5',
    ]);
    expect(found.otherBefore).toContain('claude-opus-4-5');
    expect(found.otherBefore).not.toContain('claude-opus-4-5-20251101');
    expect(found.otherAfter).toEqual(found.signedIn);
    expect(found.failed.message).toBe('Claude Code could not be asked');
  });

  it('offers Skills by folder, or fails to list them', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const codex = harnessOf(edges, 'codex');
        yield* control(fake, {
          _tag: 'AddSkill',
          harness: 'codex',
          folder: '~/app',
          name: 'deploy',
          description: 'Deploys the app',
        });
        const names = (cwd: string) =>
          codex.skills(cwd).pipe(
            Effect.provide(DEFAULT),
            Effect.map((skills) => skills.map(({ name }) => name)),
          );
        const inApp = yield* names('/home/you/app/web');
        const elsewhere = yield* names('/home/you/other');
        yield* control(fake, {
          _tag: 'SkillsFail',
          harness: 'codex',
          reason: 'skills/list timed out',
        });
        const failed = yield* Effect.flip(names('/home/you/app'));
        return { inApp, elsewhere, failed: failed.message };
      }),
    );
    expect(found).toEqual({
      inApp: ['review', 'explain', 'deploy'],
      elsewhere: ['review', 'explain'],
      failed: 'skills/list timed out',
    });
  });

  it('writes the next Title and Btw answer as told, each once', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const oneShot = Context.get(edges, OneShotPrompt);
        const prompt =
          'Write a title\n\n<latest-message>\nadd dark mode to the settings page please\n</latest-message>';
        const fromMessage = yield* oneShot.prompt(prompt);
        yield* control(fake, { _tag: 'TitleNext', title: 'Dark mode' });
        const told = yield* oneShot.prompt(prompt);
        yield* control(fake, { _tag: 'FailNextTitle', reason: '' });
        const failed = yield* Effect.flip(oneShot.prompt(prompt));
        const again = yield* oneShot.prompt(prompt);
        yield* control(fake, { _tag: 'FailNextBtw', reason: 'Asked too soon' });
        const btw = yield* Effect.flip(
          harnessOf(edges, 'claude')
            .ask({ cwd: '/', nativeId: 'n', model: 'm', question: 'why?' })
            .pipe(Effect.provide(DEFAULT)),
        );
        return {
          fromMessage,
          told,
          failed: failed.message,
          again,
          btw: btw.message,
        };
      }),
    );
    expect(found).toEqual({
      fromMessage: 'add dark mode to the',
      told: 'Dark mode',
      failed: 'Codex could not write a title.',
      again: 'add dark mode to the',
      btw: 'Asked too soon',
    });
  });
});

describe('the Agent fake, its replies', () => {
  it('opens an Agent and writes the next Title slowly, as told', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const oneShot = Context.get(edges, OneShotPrompt);
        const prompt =
          'Write a title\n\n<latest-message>\nfix the login page\n</latest-message>';
        yield* control(fake, {
          _tag: 'OpensSlowly',
          harness: 'claude',
          ms: 3000,
        });
        yield* control(fake, { _tag: 'TitleSlowly', ms: 2000 });
        const opening = yield* Effect.forkChild(opened(edges, 'claude'));
        const titling = yield* Effect.forkChild(oneShot.prompt(prompt));
        yield* TestClock.adjust('1999 millis');
        const early = [opening.pollUnsafe(), titling.pollUnsafe()];
        yield* TestClock.adjust('1 millis');
        const title = yield* Fiber.join(titling);
        const stillOpening = opening.pollUnsafe();
        yield* TestClock.adjust('1 second');
        yield* Fiber.join(opening);
        // Only the next Title is slow.
        const next = yield* Effect.forkChild(oneShot.prompt(prompt));
        yield* TestClock.adjust('1 millis');
        return {
          early,
          title,
          stillOpening,
          next: next.pollUnsafe(),
          opensInMs: fake.root.model.claude.opensInMs,
        };
      }).pipe(Effect.provide(TestClock.layer())),
    );
    expect(found).toMatchObject({
      early: [undefined, undefined],
      title: 'fix the login page',
      stillOpening: undefined,
      next: Exit.succeed('fix the login page'),
      opensInMs: 3000,
    });
  });

  it('echoes by default, and shows each running reply in its Model', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const claude = yield* opened(edges, 'claude');
        const agents = fake.root.model.agents.map(({ harness }) => harness);
        yield* control(fake, { _tag: 'SetPace', ms: 20 });
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
          yield* control(fake, { _tag: 'AnswersFail', reason: 'Not now' });
          const refused = yield* Effect.flip(open.answer(question!.id, {}));
          yield* control(fake, { _tag: 'AnswersFail', reason: '' });
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
            refused: refused.message,
            parts: partsOf(harnessOf(edges, name), outs),
            late: late._tag,
            end: lastOf(outs),
          };
        }),
      );
      expect(found.items).toBe(2);
      expect(found.waiting).toBe(true);
      expect(found.refused).toBe('Not now');
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

  it('carries on unanswered when the reply gives up asking', async () => {
    const parts = await run((fake, edges) =>
      Effect.gen(function* () {
        yield* control(fake, { _tag: 'ReplyWith', script: 'question' });
        const open = yield* opened(edges, 'claude');
        const fiber = yield* Effect.forkChild(say(open, 'go'));
        yield* until(fake, (model) => model.replies[0]?.question != null);
        yield* control(fake, { _tag: 'GiveUpAsking', reply: '' });
        return partsOf(harnessOf(edges, 'claude'), yield* Fiber.join(fiber));
      }),
    );
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'questionAnswered', answers: null }),
    );
    expect(parts.at(-1)).toMatchObject({ type: 'turnEnded', status: 'done' });
  });

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
          const scripted = yield* Effect.flip(say(open, 'go'));
          yield* control(fake, { _tag: 'ReplyWith', script: 'long' });
          yield* control(fake, { _tag: 'SetPace', ms: 20 });
          const fiber = yield* Effect.forkChild(Effect.flip(say(open, 'go')));
          yield* until(fake, (model) => model.replies.length > 0);
          yield* control(fake, { _tag: 'CutOffNow', reply: '' });
          return {
            scripted: scripted.message,
            now: (yield* Fiber.join(fiber)).message,
          };
        }),
      );
      expect(found).toEqual({ scripted: why, now: why });
    },
  );

  it('fails now with the reason given, and ends as the script says', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'codex');
        yield* control(fake, { _tag: 'ReplyWith', script: 'fails' });
        const scripted = lastOf(yield* say(open, 'go'));
        yield* control(fake, { _tag: 'ReplyWith', script: 'long' });
        yield* control(fake, { _tag: 'SetPace', ms: 20 });
        const fiber = yield* Effect.forkChild(say(open, 'go'));
        yield* until(fake, (model) => model.replies.length > 0);
        yield* control(fake, {
          _tag: 'FailNow',
          reply: '',
          reason: 'Overloaded',
        });
        const outs = yield* Fiber.join(fiber);
        return {
          scripted,
          now: lastOf(outs),
          drawn: partsOf(harnessOf(edges, 'codex'), outs).at(-1),
        };
      }),
    );
    expect(found.scripted).toMatchObject({
      status: 'failed',
      error: 'API Error: 529 Overloaded',
    });
    expect(found.now).toMatchObject({ status: 'failed', error: 'Overloaded' });
    expect(found.drawn).toMatchObject({
      type: 'turnEnded',
      status: 'failed',
      error: 'Overloaded',
    });
  });

  it('hangs until stopped, then ends cancelled', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'claude');
        yield* control(fake, { _tag: 'ReplyWith', script: 'long' });
        yield* control(fake, { _tag: 'SetPace', ms: 20 });
        const fiber = yield* Effect.forkChild(say(open, 'go'));
        yield* until(fake, (model) => model.replies.length > 0);
        yield* control(fake, { _tag: 'HangNow', reply: '' });
        yield* until(fake, (model) => model.replies[0]?.hanging === true);
        yield* open.cancel;
        return lastOf(yield* Fiber.join(fiber));
      }),
    );
    expect(found).toEqual({
      _tag: 'TurnEnd',
      status: 'cancelled',
      shown: false,
    });
  });

  it("fails every turn with the harness's login error once signed out", async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        yield* control(fake, {
          _tag: 'SignOut',
          harness: 'claude',
          configFolder: '',
        });
        const outs = yield* say(yield* opened(edges, 'claude'), 'go');
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
    const outs = await run((fake, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'claude');
        yield* control(fake, { _tag: 'ReplyWith', script: 'long' });
        yield* control(fake, { _tag: 'SetPace', ms: 5 });
        const turn = open.turn({ text: 'go', images: [] });
        const fiber = yield* Effect.forkChild(collect(turn));
        yield* until(fake, (model) => model.replies.length > 0);
        yield* turn.steer('steer-1', { text: 'also docs', images: [] });
        return yield* Fiber.join(fiber);
      }),
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

describe('the Agent fake, Background Jobs and its own Turns', () => {
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
        const shell = jobs._tag === 'Some' ? jobs.value[0]! : undefined;
        const output = yield* Effect.forkChild(
          Stream.runCollect(open.backgroundJobOutput(shell!.id)),
        );
        // Followed from here on.
        yield* Effect.sleep('20 millis');
        yield* control(fake, {
          _tag: 'WriteJobOutput',
          job: shell!.id,
          text: 'ready\n',
        });
        yield* control(fake, { _tag: 'StopsFail', reason: 'kill refused' });
        const refused = yield* Effect.flip(open.stopBackgroundJob(shell!.id));
        yield* control(fake, {
          _tag: 'EndJob',
          job: shell!.id,
          how: 'done',
          summary: '',
        });
        const ended = yield* open.between.pipe(
          Stream.take(1),
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
          left: fake.root.model.jobs.map(({ kind }) => kind),
        };
      }),
    );
    expect(found.kinds).toEqual(['shell', 'agent']);
    expect(found.output).toContain('ready');
    expect(found.output).toContain('localhost:5173');
    expect(found.refused).toBe('kill refused');
    expect(found.ended).toEqual([
      expect.objectContaining({ type: 'jobEnded', status: 'done' }),
    ]);
    expect(found.report).toContain('"pnpm dev" finished');
    expect(found.left).toEqual(['agent']);
  });

  it('starts a Turn of its own when told, once it is free', async () => {
    const found = await run((fake, edges) =>
      Effect.gen(function* () {
        const open = yield* opened(edges, 'codex');
        yield* control(fake, {
          _tag: 'StartTurnItself',
          agent: '',
          script: 'plan',
        });
        const turn = yield* open.agentTurns.pipe(Stream.runHead);
        const outs = turn._tag === 'Some' ? yield* collect(turn.value) : [];
        return {
          parts: partsOf(harnessOf(edges, 'codex'), outs),
          wakeups: fake.root.model.wakeups.length,
        };
      }),
    );
    expect(found.parts.some((part) => part.type === 'codex.plan')).toBe(true);
    expect(found.wakeups).toBe(0);
  });

  it('a reload keeps the world, not what ran in it', async () => {
    const kept = await run((fake, edges) =>
      Effect.gen(function* () {
        yield* opened(edges, 'claude');
        yield* control(fake, { _tag: 'Uninstall', harness: 'codex', why: '' });
        return agent.kept(fake.snapshot).root.model;
      }),
    );
    expect(kept.agents).toEqual([]);
    expect(kept.codex.installed).toBe(false);
  });
});
