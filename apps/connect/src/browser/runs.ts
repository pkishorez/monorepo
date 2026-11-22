import {
  type Duration,
  Effect,
  Exit,
  FiberSet,
  type Layer,
  Scope,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Principal } from '@kestack/auth-toolkit';
import { fakeSignIn } from '@kestack/auth-toolkit/fake';
import type { Dial } from '@kestack/rpc-toolkit/rpc/websocket';
import type { StoreTable } from '../connection/plugins/code/engine/index.js';
import type { HeartbeatClient } from '../connection/cli/identity/cloud/index.js';
import type { AgentEdges, Computer, Computers } from './computers/index.js';
import { heartbeat } from './heartbeat.js';
import { codePlugin } from './plugin.js';
import { End } from './sockets.js';
import { answerOf, askedOf, hostOf } from './tunnel.js';

/*
 * Every online computer's `ke-connect` in a tab, each a Run: from when the
 * computer comes online, or starts again, until it goes offline, is
 * removed, starts again, or stops on its own.
 *
 * 1. Follow  each list of `Computers` starts a Run for a computer online
 *            with none, stops the Run of one no longer online, removed or
 *            started again, and tells every other Run its computer as it
 *            is now. A Run that stopped on its own, as `ke-connect` exits,
 *            is not started again until its computer is: offline and back,
 *            or a new `startedAt`. `Computers` is told why it stopped. A
 *            computer gone offline with `silentFor` has its Last Seen
 *            pushed back that far, once; one whose `ke-connect` was
 *            removed asks Connect Cloud to forget it, once, as
 *            `ke-connect remove` does, as soon as it is online.
 * 2. Beat    a Run sends its computer's Heartbeat (heartbeat.ts), signed
 *            in on a Sign-in of its own, which it keeps across restarts;
 *            its code Plugin runs the Release Connect Cloud last named,
 *            unless the computer runs another.
 * 3. Dial    a socket to a tunnel's address reaches the Run whose
 *            computer is up there, and is answered as its tunnel answers
 *            (tunnel.ts); one passed on reaches the Run's code Plugin
 *            (plugin.ts), started for the first and shared by every
 *            other. A socket to an address no computer is up at fails, as
 *            one to a tunnel that is gone does; one open while its
 *            computer's tunnel goes down or moves, its code Plugin comes
 *            to run another Release, or its Run stops, drops.
 */

export interface RunsOptions {
  /** A computer's Heartbeat client, signed in as `signIn`, called at the version `version` reads, for the Scope. */
  readonly heartbeat: (
    signIn: Principal | null,
    version: () => string,
  ) => Effect.Effect<HeartbeatClient['Service'], never, Scope.Scope>;
  /** Sets a Connection's Last Seen `by` milliseconds back from now. */
  readonly pushBack: (id: string, by: number) => Effect.Effect<void>;
  /** The table a computer's code Plugin keeps its Store on, by its Connection id. */
  readonly storeOf: (id: string) => StoreTable;
  /** The edges every computer's code Plugin shares. */
  readonly shared: Layer.Layer<AgentEdges>;
  /** How long between Heartbeats. */
  readonly every: Duration.Input;
}

/** One `ke-connect` run of one computer. */
interface Run {
  readonly id: string;
  /** Its computer's id and when it started: another is another Run. */
  readonly started: string;
  readonly scope: Scope.Closeable;
  /** Its computer now, and on each change, for its Heartbeat. */
  readonly changes: SubscriptionRef.SubscriptionRef<Computer>;
  /** Its computer now. */
  current: Computer;
  /** The code Plugin's Release Connect Cloud last named; null until it names one. */
  wanted: string | null;
  /** Its code Plugin, started on first use. */
  readonly plugin: Effect.Effect<{
    readonly pass: (end: End) => Effect.Effect<void>;
  }>;
  /** The sockets passed to it, each by the host it was dialled at. */
  readonly open: Map<End, string>;
}

const startedOf = ({ id, startedAt }: Computer) => `${id} ${startedAt}`;

/** The Sign-in `ke-connect` on a computer holds: its own, kept across its restarts. */
const signInOf = ({ id, email }: Computer) =>
  fakeSignIn(email, `ke-connect ${id}`);

/** Follows `computers` for as long as the Scope: what dials their tunnels. */
export const runs = (computers: Computers['Service'], options: RunsOptions) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const fork = yield* FiberSet.makeRuntime<never>();
    const lock = yield* Semaphore.make(1);
    const running = new Map<string, Run>();
    const stopped = new Set<string>();
    /** The computers offline whose Last Seen was pushed back, by id. */
    const pushed = new Set<string>();
    /** The computers removed that asked Connect Cloud to forget them, by id. */
    const left = new Set<string>();

    const stop = (run: Run) =>
      Effect.suspend(() => {
        if (running.get(run.id) === run) running.delete(run.id);
        return Scope.close(run.scope, Exit.void);
      });

    // 2. Beat
    const start = (computer: Computer) =>
      Effect.gen(function* () {
        const own = yield* Scope.fork(scope);
        // The code Plugin's Scope is made before its sockets' drop, so it
        // closes after it: as a process that goes away, its sockets drop
        // before anything in it can tell them a stream ended, which Code
        // would take as done.
        const pluginScope = yield* Scope.fork(own);
        const run: Run = {
          id: computer.id,
          started: startedOf(computer),
          scope: own,
          changes: yield* SubscriptionRef.make(computer),
          current: computer,
          wanted: null,
          plugin: yield* Effect.cached(
            codePlugin(
              computer.edges,
              options.shared,
              options.storeOf(computer.id),
            ).pipe(Scope.provide(pluginScope)),
          ),
          open: new Map(),
        };
        running.set(computer.id, run);
        yield* Scope.addFinalizer(
          own,
          Effect.sync(() => {
            for (const end of run.open.keys()) End.drop(end);
          }),
        );
        const signIn = signInOf(computer);
        const client = yield* options
          .heartbeat(signIn, () => run.current.version)
          .pipe(Scope.provide(own));
        // Stopping closes the Scope the Heartbeat runs in: another fiber does it.
        const stopOnItsOwn = (why: Parameters<typeof computers.stopped>[1]) =>
          Effect.sync(() => {
            fork(
              lock.withPermit(
                Effect.gen(function* () {
                  if (running.get(run.id) !== run) return;
                  stopped.add(run.started);
                  yield* stop(run);
                  yield* computers.stopped(run.id, why);
                }),
              ),
            );
          });
        yield* heartbeat({
          computer: SubscriptionRef.changes(run.changes),
          client,
          user: {
            id: signIn?.user.id ?? '',
            email: signIn?.user.email ?? computer.email,
          },
          every: options.every,
          answered: (wanted) =>
            Effect.sync(() => {
              run.wanted = wanted['code']?.hash ?? null;
            }),
        }).pipe(Effect.flatMap(stopOnItsOwn), Effect.forkIn(own));
      });

    /** Asks Connect Cloud to forget `computer`, as `ke-connect remove` does: told nothing back. */
    const forget = (computer: Computer) =>
      Effect.scoped(
        Effect.flatMap(
          options.heartbeat(signInOf(computer), () => computer.version),
          (client) => client.Forget({ id: computer.id }),
        ),
      ).pipe(Effect.catchCause(() => Effect.void));

    // 1. Follow
    const follow = (list: ReadonlyArray<Computer>) =>
      lock.withPermit(
        Effect.gen(function* () {
          const online = new Map(
            list
              .filter(({ online, removed }) => online && !removed)
              .map((each) => [each.id, each]),
          );
          for (const run of running.values()) {
            const computer = online.get(run.id);
            if (computer === undefined || startedOf(computer) !== run.started) {
              yield* stop(run);
              continue;
            }
            // A code Plugin that comes to run another Release starts again
            // on it, as `ke-connect` swaps it: every socket it held drops.
            const swapped = computer.release !== run.current.release;
            run.current = computer;
            const host = hostOf(computer.status);
            for (const [end, at] of run.open)
              if (swapped || at !== host) End.drop(end);
            yield* SubscriptionRef.set(run.changes, computer);
          }
          const starts = new Set([...online.values()].map(startedOf));
          for (const started of stopped)
            if (!starts.has(started)) stopped.delete(started);
          for (const computer of online.values())
            if (!running.has(computer.id) && !stopped.has(startedOf(computer)))
              yield* start(computer);
          for (const computer of list) {
            if (computer.online) pushed.delete(computer.id);
            else if (computer.silentFor !== null && !pushed.has(computer.id)) {
              pushed.add(computer.id);
              yield* options.pushBack(computer.id, computer.silentFor);
            }
            if (computer.removed && computer.online && !left.has(computer.id)) {
              left.add(computer.id);
              fork(forget(computer));
            }
          }
        }),
      );
    yield* Effect.forkScoped(Stream.runForEach(computers.changes, follow));

    // 3. Dial
    const connect = (
      end: End,
      url: string,
      protocols: ReadonlyArray<string> | undefined,
    ) =>
      Effect.gen(function* () {
        const asked = askedOf(url, protocols);
        const run =
          asked === null
            ? undefined
            : [...running.values()].find(
                ({ current }) => hostOf(current.status) === asked.host,
              );
        if (asked === null || run === undefined) return End.refuse(end);
        const answer = answerOf(asked, {
          key: run.current.key,
          running: run.current.release ?? run.wanted,
        });
        switch (answer._tag) {
          case 'Refuse':
            return End.refuse(end);
          case 'Close':
            return End.accept(end, '').close(answer.code, answer.reason);
          case 'Pass': {
            const { pass } = yield* run.plugin;
            if (running.get(run.id) !== run) return End.refuse(end);
            const server = End.accept(end, answer.protocol);
            run.open.set(end, asked.host);
            end.addEventListener('close', () => run.open.delete(end), {
              once: true,
            });
            return yield* pass(server);
          }
        }
      }).pipe(
        Effect.catchCause(() => Effect.void),
        // Whatever stopped it, a socket still on its way fails.
        Effect.ensuring(Effect.sync(() => End.refuse(end))),
      );

    const dial: Dial = (url, protocols) => {
      const end = new End();
      fork(connect(end, url, protocols));
      return end;
    };
    return { dial };
  });
