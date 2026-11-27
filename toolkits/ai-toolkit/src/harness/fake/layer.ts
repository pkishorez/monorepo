import {
  Cause,
  Deferred,
  Effect,
  Layer,
  Queue,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { HarnessName } from '../../contract/raw/index.js';
import type { BinaryInfo, ModelInfo } from '../../contract/wire/index.js';
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
  type TurnEnd,
  type TurnHandle,
  type TurnOut,
} from '../contract/index.js';
import { project as claudeProject } from '../claude/project/index.js';
import { project as codexProject } from '../codex/project/index.js';
import type { AgentState } from './agent.js';
import { BUILT_IN_SKILLS, MODELS_DEV, PLAYED, type Played } from './catalog.js';
import { recordingFor, replayed } from './recordings/index.js';

/*
 * The harnesses' edges over the Agent fake's state: `Harnesses` (Claude
 * Code and Codex, each replayed from the state), `OneShotPrompt`,
 * `HarnessHost` and `Models`, what connect's code Plugin asks for besides
 * Speech. Each answer reads the state; each Agent opened and each reply
 * running is put in it, and taken out as it ends.
 *
 * 1. Host     both harnesses are installed: a binary runs when it is
 *             PATH's; a config folder is the account's, else the harness's
 *             own under `home`; only its own folder holds a login.
 * 2. Models   the login's own models, filled in from the models.dev copy;
 *             with no login, the models.dev models the harness accepts, as
 *             the real one falls back.
 * 3. Agents   each reply replays a recording (recordings/) at `paceMs` a
 *             record, the one the state names or a random one, or fails as
 *             logged out. A steer joins it between two records. Recordings
 *             never pause, so an Agent asks no questions, starts no
 *             Background Jobs and no Turns of its own.
 * 4. One-shots  a Title from the message, and a plain Btw answer.
 */

export interface AgentOptions {
  /** The home folder a config folder is under; `/home/you`, the File System fake's, unless given. */
  readonly home?: string;
  /** How long a reply waits between two records, in ms; 300 unless given. */
  readonly paceMs?: number;
}

/** What the fake's edges are. */
export type AgentEdges = Harnesses | OneShotPrompt | HarnessHost | Models;

/** One reply running, as the Layer follows it. */
interface Running {
  readonly started: Deferred.Deferred<void>;
  readonly cancel: Deferred.Deferred<void>;
  ended: boolean;
  /** Steers taken, not yet joined. */
  readonly steers: Array<string>;
}

const NOT_SIGNED_IN_MODELS =
  'cannot ask this login which models it runs; listing models.dev';

export const agentOver = (
  state: SubscriptionRef.SubscriptionRef<AgentState>,
  { home = '/home/you', paceMs = 300 }: AgentOptions = {},
): Layer.Layer<AgentEdges> =>
  Layer.unwrap(
    Effect.sync(() => {
      const change = (to: (now: AgentState) => Partial<AgentState>) =>
        SubscriptionRef.update(state, (now) => ({ ...now, ...to(now) }));

      // Ids unique in this tab, and apart from those of an earlier load.
      const stamp = Date.now().toString(36);
      let counted = 0;
      const id = (prefix: string) => `${prefix}${stamp}${++counted}`;

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
      const open = (played: Played, config: AgentConfig) =>
        Effect.gen(function* () {
          const account = yield* HarnessAccount;
          const binary = binaryOf(played, account.binary);
          if (binary.error !== null)
            return yield* new HarnessError({ message: binary.error });
          const loggedIn = signedIn(played, account.configFolder);
          const nativeId = config.nativeId ?? id(`fake-${played.name}-`);
          let current = config.model;
          let settings: Readonly<Record<string, string>> = {
            ...config.settings,
          };
          let running: Running | undefined;

          yield* change(({ agents }) => ({
            agents: [
              ...agents.filter(({ id }) => id !== nativeId),
              {
                id: nativeId,
                harness: played.name,
                cwd: config.cwd,
                model: config.model,
                settings,
              },
            ],
          }));
          // Its replies go with it.
          yield* Effect.addFinalizer(() =>
            change(({ agents, replies }) => ({
              agents: agents.filter(({ id }) => id !== nativeId),
              replies: replies.filter(({ agent }) => agent !== nativeId),
            })),
          );

          const turnOf = (prompt: string): TurnHandle => {
            const turn: Running = {
              started: Deferred.makeUnsafe(),
              cancel: Deferred.makeUnsafe(),
              ended: false,
              steers: [],
            };
            const out = Stream.unwrap(
              Effect.gen(function* () {
                const queue = yield* Queue.unbounded<
                  TurnOut,
                  HarnessError | Cause.Done
                >();
                const replyId = id('reply-');
                const turnId = id('turn-');
                const { replyWith } = yield* SubscriptionRef.get(state);
                const recording = recordingFor(played.name, replyWith);
                running = turn;
                // A Turn's model and settings hold from it on: its Agent runs on them now.
                yield* change(({ agents, replies }) => ({
                  agents: agents.map((one) =>
                    one.id === nativeId
                      ? { ...one, model: current, settings }
                      : one,
                  ),
                  replies: [
                    ...replies,
                    {
                      id: replyId,
                      agent: nativeId,
                      harness: played.name,
                      prompt,
                      recording: recording.name,
                    },
                  ],
                }));
                yield* Deferred.succeed(turn.started, undefined);

                const offer = (each: TurnOut) =>
                  Queue.offer(queue, each).pipe(Effect.asVoid);
                /** The steers taken since the last record, each joining here. */
                const steered = Effect.suspend(() =>
                  Effect.forEach(
                    turn.steers.splice(0),
                    (steerId) => offer({ _tag: 'TurnSteered', id: steerId }),
                    { discard: true },
                  ),
                );
                const records = replayed(recording, {
                  nativeId,
                  turnId,
                  cwd: config.cwd,
                  home,
                });
                const end: TurnEnd = loggedIn
                  ? {
                      _tag: 'TurnEnd',
                      status: 'done',
                      forkPoint:
                        played.name === 'claude'
                          ? `${nativeId}:${turnId}`
                          : turnId,
                      shown: true,
                    }
                  : {
                      _tag: 'TurnEnd',
                      status: 'failed',
                      error: played.notLoggedIn,
                      shown: false,
                    };
                const replay = Effect.gen(function* () {
                  if (loggedIn)
                    for (const record of records) {
                      yield* Effect.sleep(paceMs);
                      yield* steered;
                      yield* offer(record);
                    }
                  yield* steered;
                  yield* offer(end);
                });

                yield* Effect.raceFirst(
                  replay,
                  Deferred.await(turn.cancel).pipe(
                    Effect.andThen(
                      offer({
                        _tag: 'TurnEnd',
                        status: 'cancelled',
                        shown: false,
                      }),
                    ),
                  ),
                ).pipe(
                  Effect.andThen(Queue.end(queue)),
                  Effect.ensuring(
                    Effect.suspend(() => {
                      turn.ended = true;
                      if (running === turn) running = undefined;
                      return change(({ replies }) => ({
                        replies: replies.filter(({ id }) => id !== replyId),
                      }));
                    }),
                  ),
                  Effect.forkScoped,
                );
                return Stream.fromQueue(queue);
              }),
            );

            const steer = (steerId: string) =>
              Effect.gen(function* () {
                yield* Deferred.await(turn.started);
                if (turn.ended || running !== turn)
                  return yield* new HarnessError({ message: 'The turn ended' });
                turn.steers.push(steerId);
              });
            return { out, steer };
          };

          const agent: Agent = {
            nativeId: Effect.succeed(nativeId),
            turn: (input) => {
              if (input.model !== undefined) current = input.model;
              if (input.settings !== undefined)
                settings = { ...settings, ...input.settings };
              return turnOf(input.text);
            },
            cancel: Effect.suspend(() =>
              running === undefined
                ? Effect.void
                : Deferred.succeed(running.cancel, undefined),
            ).pipe(Effect.asVoid),
            agentTurns: Stream.empty,
            between: Stream.empty,
            backgroundJobs: Stream.make([]),
            stopBackgroundJob: (jobId) =>
              Effect.fail(
                new HarnessError({ message: `No Background Job ${jobId}` }),
              ),
            backgroundJobOutput: () => Stream.empty,
            questions: Stream.make([]),
            answer: (questionId) =>
              Effect.fail(new QuestionNotAsked({ id: questionId })),
            mcpStatus: Effect.succeed([
              { name: 'github', status: 'connected', tools: 12 },
            ]),
            contextUsage: Effect.map(
              SubscriptionRef.get(state),
              ({ context }) => ({
                usedTokens: context.usedTokens,
                maxTokens: context.maxTokens,
                rateLimits: [
                  { label: '5-hour', usedPercent: context.sessionPercent },
                  { label: 'Weekly', usedPercent: context.weeklyPercent },
                ],
              }),
            ),
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
