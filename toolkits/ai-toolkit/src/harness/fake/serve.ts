import { Cause, Deferred, Effect, Layer, Queue, Stream } from 'effect';
import type { Runtime } from '@kestack/kabuki';
import type { HarnessName } from '../../contract/raw/index.js';
import type {
  BackgroundJob,
  BinaryInfo,
  ModelInfo,
  QuestionAnswer,
} from '../../contract/wire/index.js';
import {
  HarnessAccount,
  HarnessError,
  Harnesses,
  HarnessHost,
  InvalidBinary,
  Models,
  OneShotPrompt,
  QuestionNotAsked,
  type Agent,
  type AgentConfig,
  type Harness,
  type RawOut,
  type TurnHandle,
  type TurnOut,
} from '../contract/index.js';
import { project as claudeProject } from '../claude/project/index.js';
import { project as codexProject } from '../codex/project/index.js';
import type { AgentFake, AgentMessage, AgentModel } from './actor.js';
import { BUILT_IN_SKILLS, MODELS_DEV, PLAYED, type Played } from './catalog.js';
import { claudeWriter } from './claude.js';
import { codexWriter } from './codex.js';
import { loggedOut, play, type Stage } from './play.js';
import { sayOnly, scriptNamed, type Script } from './scripts.js';
import type { Started, WriterContext } from './writer.js';

/*
 * The harnesses' edges over the running Agent fake: `Harnesses` (Claude
 * Code and Codex, each played from the Model), `OneShotPrompt`,
 * `HarnessHost` and `Models`, what connect's code Plugin asks for besides
 * Speech. Thin: each answer reads the Model, and every change is a Message
 * to it.
 *
 * 1. Host     both harnesses are installed: a binary runs when it is
 *             PATH's; a config folder is the account's, else the harness's
 *             own under `home`; only its own folder holds a login.
 * 2. Models   the login's own models, filled in from the models.dev copy;
 *             with no login, the models.dev models the harness accepts, as
 *             the real one falls back.
 * 3. Agents   each reply plays the Model's Script (play.ts) through the
 *             harness's Writer at `paceMs`, or fails as logged out; its
 *             questions, Background Jobs and Context Usage are read from
 *             the Model. A job ends once its Script's time is up, or when
 *             stopped; its end is written between turns, and Claude Code
 *             then starts a Turn of its own to report it.
 * 4. One-shots  a Title from the message, and a plain Btw answer.
 */

export interface AgentOptions {
  /** The home folder a config folder is under; `/home/you`, the File System fake's, unless given. */
  readonly home?: string;
  /** How long a reply waits between two pieces, in ms; 300 unless given. */
  readonly paceMs?: number;
}

/** What the fake's edges are. */
export type AgentEdges = Harnesses | OneShotPrompt | HarnessHost | Models;

/** One reply running, as serve.ts follows it. */
interface Running {
  readonly id: string;
  readonly started: Deferred.Deferred<void>;
  readonly cancel: Deferred.Deferred<void>;
  queue: Queue.Queue<TurnOut, HarnessError | Cause.Done> | undefined;
  ended: boolean;
  /** Steers taken, not yet said. */
  readonly steers: Array<{ readonly id: string; readonly text: string }>;
}

const NOT_SIGNED_IN_MODELS =
  'cannot ask this login which models it runs; listing models.dev';

export const agentOver = (
  runtime: Runtime<typeof AgentFake>,
  { home = '/home/you', paceMs = 300 }: AgentOptions = {},
): Layer.Layer<AgentEdges> =>
  Layer.unwrap(
    Effect.sync(() => {
      const root = runtime.root;
      const model = (): AgentModel => root.model;
      const send = (message: AgentMessage) =>
        Effect.sync(() => void root.send(message));
      const changes: Stream.Stream<AgentModel> = runtime.changes.pipe(
        Stream.map((snapshot) => snapshot.root.model),
      );

      // Ids unique in this tab, and apart from those of an earlier load.
      const stamp = Date.now().toString(36);
      let counted = 0;
      const id = (prefix: string) => `${prefix}${stamp}${++counted}`;

      /** Every Agent Question asked, by its id, until it is answered. */
      const asked = new Map<
        string,
        {
          readonly reply: string;
          readonly answer: Deferred.Deferred<QuestionAnswer | null>;
        }
      >();
      /** Every Background Job started, as its Writer wrote it. */
      const jobs = new Map<string, Started>();
      /** What each ended job wrote, for a follower that reads only after it is gone. */
      const wrote = new Map<string, ReadonlyArray<string>>();

      // 1. Host
      const expand = (path: string) => {
        const given = path.trim();
        if (given === '~') return home;
        if (given.startsWith('~/')) return `${home}${given.slice(1)}`;
        return given.startsWith('/') ? given : `${home}/${given}`;
      };

      const binaryOf = (
        played: Played,
        binary: string | undefined,
      ): BinaryInfo => {
        const path = binary === undefined ? played.onPath : expand(binary);
        return path === played.onPath
          ? {
              path,
              version: played.version,
              error: null,
              isDefault: binary === undefined,
            }
          : {
              path: null,
              version: null,
              error: `No file at ${path}`,
              isDefault: false,
            };
      };

      const signedIn = (played: Played, configFolder: string | undefined) =>
        configFolder === undefined ||
        expand(configFolder) === `${home}/${played.own}`;

      // 3. Agents
      const writerOf = (played: Played) =>
        played.name === 'claude' ? claudeWriter : codexWriter;

      const open = (played: Played, config: AgentConfig) =>
        Effect.gen(function* () {
          const account = yield* HarnessAccount;
          const binary = binaryOf(played, account.binary);
          if (binary.error !== null)
            return yield* new HarnessError({ message: binary.error });
          const scope = yield* Effect.scope;
          const loggedIn = signedIn(played, account.configFolder);
          const nativeId = config.nativeId ?? id(`fake-${played.name}-`);
          let current = config.model;
          let settings: Readonly<Record<string, string>> = {
            ...config.settings,
          };
          let running: Running | undefined;
          /** An Agent-started Turn handed out, not yet read. */
          let offered = false;
          const agentTurns = yield* Queue.unbounded<TurnHandle>();
          const between = yield* Queue.unbounded<RawOut>();
          /** Turns Claude Code starts to report a job's end, waiting for the agent to be free. */
          const reports: Array<Script> = [];

          yield* send({
            _tag: 'AgentOpened',
            id: nativeId,
            harness: played.name,
            cwd: config.cwd,
            model: config.model,
            settings,
          });
          yield* Effect.addFinalizer(() =>
            send({ _tag: 'AgentClosed', id: nativeId }),
          );

          const turnOf = (
            script: Script,
            prompt: string,
            startedBy: 'You' | 'Agent',
          ): TurnHandle => {
            const turn: Running = {
              id: id('reply-'),
              started: Deferred.makeUnsafe(),
              cancel: Deferred.makeUnsafe(),
              queue: undefined,
              ended: false,
              steers: [],
            };
            const out = Stream.unwrap(
              Effect.gen(function* () {
                const queue = yield* Queue.unbounded<
                  TurnOut,
                  HarnessError | Cause.Done
                >();
                turn.queue = queue;
                running = turn;
                offered = false;
                yield* send({
                  _tag: 'ReplyStarted',
                  id: turn.id,
                  agent: nativeId,
                  harness: played.name,
                  prompt,
                  script: script.name,
                  startedBy,
                  model: current,
                  settings,
                });
                yield* Deferred.succeed(turn.started, undefined);
                const context: WriterContext = {
                  nativeId,
                  turnId: id('turn-'),
                  cwd: config.cwd,
                  model: current,
                  agentId: undefined,
                  id,
                };
                const writer = writerOf(played)(context);
                const stage: Stage = {
                  emit: (each) => Queue.offer(queue, each).pipe(Effect.asVoid),
                  pace: paceMs,
                  ask: (question) =>
                    Effect.gen(function* () {
                      const answer =
                        yield* Deferred.make<QuestionAnswer | null>();
                      asked.set(question.id, { reply: turn.id, answer });
                      yield* send({
                        _tag: 'ReplyAsks',
                        id: turn.id,
                        question,
                      });
                      return { answer: yield* Deferred.await(answer) };
                    }),
                  heard: Effect.andThen(
                    Effect.sync(() => {
                      for (const [question, each] of asked)
                        if (each.reply === turn.id) asked.delete(question);
                    }),
                    send({ _tag: 'ReplyHeard', id: turn.id }),
                  ),
                  // It runs on after the reply, until its Script's time is up.
                  jobStarted: (step, started) =>
                    Effect.gen(function* () {
                      jobs.set(started.id, started);
                      yield* send({
                        _tag: 'JobStarted',
                        id: started.id,
                        agent: nativeId,
                        harness: played.name,
                        kind: step.kind,
                        title: step.title,
                        toolCallId: started.toolCallId,
                        startedAt: Date.now(),
                        output: step.output,
                      });
                      yield* Effect.forkIn(
                        Effect.andThen(
                          Effect.sleep(step.runsMs),
                          send({
                            _tag: 'JobEnded',
                            id: started.id,
                            how: 'done',
                            summary: step.summary,
                          }),
                        ),
                        scope,
                      );
                    }),
                  filled: (usedTokens) =>
                    send({ _tag: 'ContextFilled', usedTokens }),
                  steers: Effect.sync(() => turn.steers.splice(0)),
                };
                const playing = loggedIn
                  ? play(script, writer, stage)
                  : Effect.succeed(loggedOut(writer));
                yield* Effect.raceFirst(
                  playing,
                  Effect.as(Deferred.await(turn.cancel), null),
                ).pipe(
                  Effect.flatMap((ended) => {
                    if (ended === null)
                      return Queue.offer(queue, {
                        _tag: 'TurnEnd',
                        status: 'cancelled',
                        shown: false,
                      }).pipe(Effect.andThen(Queue.end(queue)));
                    return Queue.offerAll(queue, ended.records).pipe(
                      Effect.andThen(
                        ended.end._tag === 'TurnEnd'
                          ? Queue.offer(queue, ended.end).pipe(
                              Effect.andThen(Queue.end(queue)),
                            )
                          : Queue.fail(queue, ended.end),
                      ),
                    );
                  }),
                  Effect.ensuring(
                    Effect.suspend(() => {
                      turn.ended = true;
                      if (running === turn) running = undefined;
                      return Effect.andThen(
                        stage.heard,
                        send({ _tag: 'ReplyEnded', id: turn.id }),
                      );
                    }),
                  ),
                  Effect.forkScoped,
                );
                return Stream.fromQueue(queue);
              }),
            );

            const steer = (steerId: string, input: { readonly text: string }) =>
              Effect.gen(function* () {
                yield* Deferred.await(turn.started);
                if (turn.ended || running !== turn)
                  return yield* new HarnessError({ message: 'The turn ended' });
                turn.steers.push({ id: steerId, text: input.text });
              });
            return { out, steer };
          };

          // Job endings, as the Model has them.
          const ending = new Set<string>();
          const onChange = (now: AgentModel) =>
            Effect.gen(function* () {
              for (const job of now.jobs) {
                if (
                  job.agent !== nativeId ||
                  job.ending === null ||
                  ending.has(job.id)
                )
                  continue;
                ending.add(job.id);
                const records =
                  jobs
                    .get(job.id)
                    ?.ended(
                      job.ending.how,
                      job.ending.summary,
                      job.output.join(''),
                    ) ?? [];
                const into = running?.queue;
                yield* Queue.offerAll(
                  into !== undefined && !running!.ended ? into : between,
                  records,
                );
                jobs.delete(job.id);
                wrote.set(job.id, job.output);
                yield* send({ _tag: 'JobGone', id: job.id });
                // Claude Code tells the model at once, in a Turn of its own.
                if (played.name === 'claude' && job.ending.how !== 'stopped')
                  reports.push(
                    sayOnly(
                      'job report',
                      `The background ${job.kind === 'shell' ? 'command' : 'agent'} "${job.title}" ${job.ending.how === 'done' ? 'finished' : 'failed'}.`,
                    ),
                  );
              }
              if (running !== undefined || offered) return;
              const report = reports.shift();
              if (report === undefined) return;
              offered = true;
              yield* Queue.offer(agentTurns, turnOf(report, '', 'Agent'));
            });
          yield* changes.pipe(Stream.runForEach(onChange), Effect.forkScoped);

          const jobsOf = (now: AgentModel): ReadonlyArray<BackgroundJob> =>
            now.jobs
              .filter((job) => job.agent === nativeId)
              .map((job) => ({
                id: job.id,
                kind: job.kind,
                title: job.title,
                startedAt: job.startedAt,
                toolCallId: job.toolCallId,
              }));
          const same = <A>(a: A, b: A) =>
            JSON.stringify(a) === JSON.stringify(b);

          const agent: Agent = {
            nativeId: Effect.succeed(nativeId),
            turn: (input) => {
              if (input.model !== undefined) current = input.model;
              if (input.settings !== undefined)
                settings = { ...settings, ...input.settings };
              return turnOf(
                scriptNamed(model().replyWith, input.text),
                input.text,
                'You',
              );
            },
            cancel: Effect.suspend(() =>
              running === undefined
                ? Effect.void
                : Deferred.succeed(running.cancel, undefined),
            ).pipe(Effect.asVoid),
            agentTurns: Stream.fromQueue(agentTurns),
            between: Stream.fromQueue(between),
            backgroundJobs: changes.pipe(
              Stream.map(jobsOf),
              Stream.changesWith(same),
            ),
            stopBackgroundJob: (jobId) =>
              Effect.suspend(() => {
                if (!model().jobs.some((job) => job.id === jobId))
                  return Effect.fail(
                    new HarnessError({ message: `No Background Job ${jobId}` }),
                  );
                return send({
                  _tag: 'JobEnded',
                  id: jobId,
                  how: 'stopped',
                  summary: '',
                });
              }),
            backgroundJobOutput: (jobId) =>
              Stream.suspend(() => {
                let sent = 0;
                return changes.pipe(
                  Stream.map((now) => now.jobs.find((job) => job.id === jobId)),
                  // Until it ends, with what it wrote last.
                  Stream.takeUntil(
                    (job) => job === undefined || job.ending !== null,
                  ),
                  Stream.map((job) => {
                    const output = job?.output ?? wrote.get(jobId) ?? [];
                    const fresh = output.slice(sent).join('');
                    sent = output.length;
                    return fresh;
                  }),
                  Stream.filter((text) => text !== ''),
                );
              }),
            questions: changes.pipe(
              Stream.map((now) =>
                now.replies.flatMap((reply) =>
                  reply.agent === nativeId && reply.question !== null
                    ? [reply.question]
                    : [],
                ),
              ),
              Stream.changesWith(same),
            ),
            answer: (questionId, answer) =>
              Effect.suspend(
                (): Effect.Effect<void, HarnessError | QuestionNotAsked> => {
                  const found = asked.get(questionId);
                  if (found === undefined)
                    return Effect.fail(
                      new QuestionNotAsked({ id: questionId }),
                    );
                  asked.delete(questionId);
                  return Deferred.succeed(found.answer, answer).pipe(
                    Effect.asVoid,
                  );
                },
              ),
            mcpStatus: Effect.succeed([
              { name: 'github', status: 'connected', tools: 12 },
            ]),
            contextUsage: Effect.sync(() => {
              const { context } = model();
              return {
                usedTokens: context.usedTokens,
                maxTokens: context.maxTokens,
                rateLimits: [
                  { label: '5-hour', usedPercent: context.sessionPercent },
                  { label: 'Weekly', usedPercent: context.weeklyPercent },
                ],
              };
            }),
          };
          return agent;
        });

      const harnessOf = (played: Played): Harness => ({
        name: played.name,
        label: played.label,
        modelsProvider: played.modelsProvider,
        acceptsModel: played.acceptsModel,
        defaultModel: played.defaultModel,
        settings: played.settings,
        open: (config) => open(played, config),
        skills: () => Effect.succeed(BUILT_IN_SKILLS),
        fork: (input) =>
          Effect.sync(() => ({ nativeId: id(`${input.nativeId}-fork-`) })),
        ask: (input) =>
          Effect.sync(() => {
            const text = `A short answer to “${input.question.trim()}”, from the session so far: nothing in it changes the plan.`;
            return input.schema === undefined
              ? { _tag: 'Text' as const, text }
              : { _tag: 'Data' as const, data: { answer: text } };
          }),
        binary: Effect.gen(function* () {
          const account = yield* HarnessAccount;
          return binaryOf(played, account.binary);
        }),
        project: played.name === 'claude' ? claudeProject : codexProject,
      });

      const all = [harnessOf(PLAYED.claude), harnessOf(PLAYED.codex)];
      const playedOf = (harness: Harness) => PLAYED[harness.name];

      // 2. Models
      const listed = (played: Played): ReadonlyArray<ModelInfo> =>
        MODELS_DEV[played.modelsProvider]
          .filter((info) => played.acceptsModel(info.id))
          .toSorted((a, b) =>
            (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''),
          );

      const models = Layer.succeed(Models, {
        list: (harness) =>
          Effect.gen(function* () {
            const played = playedOf(harness);
            const account = yield* HarnessAccount;
            if (!signedIn(played, account.configFolder)) {
              yield* Effect.logWarning(
                `${played.label} ${NOT_SIGNED_IN_MODELS}`,
              );
              return listed(played);
            }
            const known = MODELS_DEV[played.modelsProvider];
            return played.account.map(
              ({ id: model }) =>
                known.find((info) => info.id === model) ?? {
                  id: model,
                  name: model,
                  releaseDate: null,
                },
            );
          }),
        defaultModel: (harness) =>
          Effect.gen(function* () {
            const played = playedOf(harness);
            const account = yield* HarnessAccount;
            return signedIn(played, account.configFolder)
              ? (played.account.find(({ isDefault }) => isDefault)?.id ??
                  played.defaultModel)
              : played.defaultModel;
          }),
      });

      const host = Layer.succeed(HarnessHost, {
        binaryAt: (harness, account) =>
          Effect.sync(() => binaryOf(playedOf(harness), account.binary)),
        checkBinary: (harness, given) =>
          Effect.suspend(() => {
            const info = binaryOf(playedOf(harness), given);
            return info.error === null
              ? Effect.succeed(info.path!)
              : Effect.fail(new InvalidBinary({ message: info.error }));
          }),
        configFolderOf: (name: HarnessName, configFolder) =>
          Effect.sync(() =>
            configFolder === undefined
              ? {
                  path: `${home}/${PLAYED[name].own}`,
                  from: 'default' as const,
                }
              : { path: expand(configFolder), from: 'account' as const },
          ),
      });

      // 4. One-shots
      const oneShot = Layer.succeed(OneShotPrompt, {
        prompt: (text) =>
          Effect.sync(() => {
            const latest =
              /<latest-message>\n([\s\S]*?)\n<\/latest-message>/.exec(
                text,
              )?.[1] ?? text;
            return (
              latest.trim().split(/\s+/).slice(0, 5).join(' ') ||
              'A new session'
            );
          }),
      });

      return Layer.mergeAll(
        // The mark every fake carries: a production build that has it fails.
        Layer.effectDiscard(Effect.logDebug('kestack-fake: the Agent fake')),
        Layer.succeed(Harnesses, {
          all,
          get: (name) => {
            const found = all.find((harness) => harness.name === name);
            if (found === undefined) throw new Error(`No harness ${name}`);
            return found;
          },
        }),
        oneShot,
        host,
        models,
      );
    }),
  );
