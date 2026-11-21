import {
  Clock,
  Context,
  Effect,
  Exit,
  Layer,
  Ref,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Runtime } from '@kestack/kabuki';
import type { ConnectionStatus } from '../../contracts/heartbeat/index.js';
import {
  fileSystemOver,
  handleOf,
} from '../../connection/plugins/code/engine/services/file-system/fake/index.js';
import { fakeGit } from '../../connection/plugins/code/engine/services/git/fake/index.js';
import {
  ANOTHER_RELEASE,
  type AnotherDevice,
  type CloudConditions,
  type Computer,
  type ComputerEdges,
  Computers,
  ConnectCloud,
  tunnelOf,
} from '../computers/index.js';
import type { ComputersFake } from './actor.js';
import type { ComputerModel } from './computer.js';
import { actElsewhere } from './elsewhere.js';

/*
 * `Computers` and `ConnectCloud` over the running Computers Fake: what
 * Connect in the tab reads of the outside world.
 *
 * 1. Edges    each computer's File System is its File System Child, over
 *             its live Instance (`fileSystemOver(handleOf(child))`), and
 *             its git the Git fake over it, built once per computer in a
 *             Scope of its own that lasts until the computer is removed.
 * 2. Read     each computer's Model is read into a `Computer`: its key
 *             and tunnel address by how often they changed, its tunnel's
 *             times stamped as serve first sees each change, the Update
 *             having no clock, and `ANOTHER_RELEASE` while it runs another.
 *             The list is told again only when what it says changes, not
 *             at every file the code Plugin writes.
 * 3. Told     a computer whose `ke-connect` stopped on its own is Sent
 *             `StoppedOnItsOwn`; how another device reaches Connect in the
 *             tab is kept for the acts.
 * 4. Acts     each act from another device queued on a computer is
 *             carried out once Connect in the tab has said how another
 *             device reaches it (elsewhere.ts), and Sent back to the
 *             computer as `ActedElsewhere`; one at a time per act.
 *
 * Every change to the Fake is a Message it Sends.
 */

type Root = Runtime<typeof ComputersFake>['root'];
type ComputerInstance = Root['children']['computers'][number];

/** A computer's Connection Key after `keys` changes. */
const keyOf = (id: string, keys: number) => `fake-key-${id}-${keys}`;

/** A computer's tunnel address after `moves` moves. */
const urlOf = (id: string, moves: number) =>
  tunnelOf(moves === 0 ? id : `${id}-${moves}`);

/** Its tunnel's status as a Report carries it, every time in it `at`. */
const statusOf = (model: ComputerModel, at: number): ConnectionStatus => {
  const url = urlOf(model.id, model.moves);
  const { tunnel } = model;
  switch (tunnel._tag) {
    case 'Downloading':
      return {
        _tag: 'SettingUp',
        step: {
          _tag: 'Downloading',
          elapsed: tunnel.elapsed,
          received: tunnel.received,
        },
      };
    case 'Opening':
      return { _tag: 'SettingUp', step: { _tag: 'Opening' } };
    case 'Failed':
      return {
        _tag: 'SettingUp',
        step: { _tag: 'Failed', at, problem: tunnel.problem },
      };
    case 'Unchecked':
      return { _tag: 'Ready', url, check: { _tag: 'Unchecked' } };
    case 'Reachable':
      return { _tag: 'Ready', url, check: { _tag: 'Reachable', at } };
    case 'Unreachable':
      return {
        _tag: 'Ready',
        url,
        check: { _tag: 'Unreachable', at, problem: tunnel.problem },
      };
  }
};

/** What a computer's Model says to Connect in the tab, but for its tunnel's times. */
const sayingOf = (model: ComputerModel) =>
  JSON.stringify([
    model.id,
    model.name,
    model.email,
    model.version,
    model.online,
    model.silentFor,
    model.removed,
    model.starts,
    model.keys,
    model.moves,
    model.tunnel,
    model.untilReload,
  ]);

/** Connect Cloud's conditions, as the root's Model says them. */
const conditionsOf = (root: Root): CloudConditions => ({
  reachable: root.model.cloud.reachable,
  minConnect: root.model.cloud.minConnect,
  release: root.model.untilReload.cloudRelease,
});

/** `Computers` and `ConnectCloud` over the running Computers Fake, for as long as the Layer. */
export const serveComputers = (
  runtime: Runtime<typeof ComputersFake>,
): Layer.Layer<Computers | ConnectCloud> =>
  Layer.effectContext(
    Effect.gen(function* () {
      // The mark every fake carries: a production build that has it fails.
      yield* Effect.logDebug('kestack-fake: the Computers fake serves');
      const scope = yield* Effect.scope;
      const root = runtime.root;
      const instances = () => root.children.computers;

      // 1. Edges
      const built = new Map<
        string,
        {
          readonly scope: Scope.Closeable;
          readonly edges: Layer.Layer<ComputerEdges>;
        }
      >();
      const edgesOf = (computer: ComputerInstance) =>
        Effect.gen(function* () {
          const found = built.get(computer.address);
          if (found !== undefined) return found.edges;
          const own = yield* Scope.fork(scope);
          const files = fileSystemOver(handleOf(computer.children.fileSystem));
          const context = yield* Layer.buildWithScope(
            Layer.merge(files, fakeGit.pipe(Layer.provide(files))),
            own,
          );
          const edges = Layer.succeedContext(context);
          built.set(computer.address, { scope: own, edges });
          return edges;
        });

      // 2. Read
      const stamped = new Map<
        string,
        { readonly tunnel: string; readonly at: number }
      >();
      const read = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const all = instances();
        const list: Array<Computer> = [];
        for (const computer of all) {
          const { model } = computer;
          const tunnel = JSON.stringify(model.tunnel);
          const last = stamped.get(computer.address);
          const at = last?.tunnel === tunnel ? last.at : now;
          stamped.set(computer.address, { tunnel, at });
          list.push({
            id: model.id,
            name: model.name,
            email: model.email,
            version: model.version,
            online: model.online,
            silentFor: model.silentFor,
            removed: model.removed,
            startedAt: model.starts,
            key: keyOf(model.id, model.keys),
            status: statusOf(model, at),
            release: model.untilReload.runsAnotherRelease
              ? ANOTHER_RELEASE
              : null,
            edges: yield* edgesOf(computer),
          });
        }
        const kept = new Set<string>(all.map(({ address }) => address));
        for (const [address, { scope: own }] of built)
          if (!kept.has(address)) {
            built.delete(address);
            stamped.delete(address);
            yield* Scope.close(own, Exit.void);
          }
        return list;
      });
      /** What the list says now, each computer by its Instance. */
      const saying = () =>
        instances()
          .map(({ address, model }) => `${address} ${sayingOf(model)}`)
          .join('\n');
      let said = saying();
      const computers = yield* SubscriptionRef.make(yield* read);
      const cloud = yield* SubscriptionRef.make(conditionsOf(root));

      // 3. Told
      const device = yield* SubscriptionRef.make<AnotherDevice | null>(null);
      const reached = SubscriptionRef.changes(device).pipe(
        Stream.filter((each) => each !== null),
        Stream.runHead,
        Effect.flatMap((found) =>
          found._tag === 'Some' ? Effect.succeed(found.value) : Effect.never,
        ),
      );

      // 4. Acts
      const acting = yield* Ref.make(new Set<string>());
      const act = (computer: ComputerInstance) =>
        Effect.forEach(
          computer.model.elsewhere,
          ({ id, act: which }) => {
            const key = `${computer.address} ${id}`;
            return Ref.modify(acting, (now) =>
              now.has(key) ? [false, now] : [true, new Set([...now, key])],
            ).pipe(
              Effect.flatMap((first) =>
                first
                  ? Effect.forkIn(
                      reached.pipe(
                        Effect.flatMap((another) =>
                          actElsewhere(another, computer.model.id, which),
                        ),
                        Effect.flatMap((saying) =>
                          Effect.sync(
                            () =>
                              void computer.send({
                                _tag: 'ActedElsewhere',
                                id,
                                said: saying,
                              }),
                          ),
                        ),
                      ),
                      scope,
                    )
                  : Effect.void,
              ),
            );
          },
          { discard: true },
        );

      yield* Effect.forkScoped(
        Stream.runForEach(runtime.changes, () =>
          Effect.gen(function* () {
            // Connect Cloud first, so a Report a computer's change sends finds it as it is now.
            const conditions = conditionsOf(root);
            if (
              JSON.stringify(conditions) !==
              JSON.stringify(yield* SubscriptionRef.get(cloud))
            )
              yield* SubscriptionRef.set(cloud, conditions);
            const now = saying();
            if (now !== said) {
              said = now;
              yield* SubscriptionRef.set(computers, yield* read);
            }
            yield* Effect.forEach(instances(), act, { discard: true });
          }),
        ),
      );

      return Context.make(Computers, {
        changes: SubscriptionRef.changes(computers),
        stopped: (id, why) =>
          Effect.sync(() => {
            instances()
              .find(({ key }) => key === id)
              ?.send({ _tag: 'StoppedOnItsOwn', why });
          }),
        anotherDevice: (another) => SubscriptionRef.set(device, another),
      }).pipe(
        Context.add(ConnectCloud, {
          changes: SubscriptionRef.changes(cloud),
        }),
      );
    }),
  );
