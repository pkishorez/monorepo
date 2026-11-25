import {
  Clock,
  Effect,
  Exit,
  Layer,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Runtime } from '@kestack/kabuki';
import {
  fileSystemOver,
  handleOf,
} from '../../connection/plugins/code/engine/services/file-system/fake/index.js';
import { fakeGit } from '../../connection/plugins/code/engine/services/git/fake/index.js';
import {
  type Computer,
  type ComputerEdges,
  Computers,
  tunnelOf,
} from '../computers/index.js';
import type { ComputersFake } from './actor.js';
import type { ComputerModel } from './computer.js';

/*
 * `Computers` over the running Computers Fake: what Connect in the tab
 * reads of the outside world.
 *
 * 1. Edges  each computer's File System is its File System Child, over
 *           its live Instance (`fileSystemOver(handleOf(child))`), and its
 *           git the Git fake over it, built once per computer in a Scope
 *           of its own that lasts until the computer is removed.
 * 2. Read   each computer's Model is read into a `Computer`: its own
 *           Connection Key, and its tunnel Ready and reached at its
 *           address, checked when serve first saw it, the Update having no
 *           clock. The list is told again only when what it says changes,
 *           not at every file the code Plugin writes.
 * 3. Told   a computer whose `ke-connect` stopped on its own is Sent
 *           `StoppedOnItsOwn`.
 *
 * Every change to the Fake is a Message it Sends.
 */

type Root = Runtime<typeof ComputersFake>['root'];
type ComputerInstance = Root['children']['computers'][number];

/** A computer's Connection Key. */
const keyOf = (id: string) => `fake-key-${id}`;

/** What a computer's Model says to Connect in the tab. */
const sayingOf = (model: ComputerModel) =>
  JSON.stringify([
    model.id,
    model.name,
    model.email,
    model.version,
    model.online,
    model.silentFor,
  ]);

/** `Computers` over the running Computers Fake, for as long as the Layer. */
export const serveComputers = (
  runtime: Runtime<typeof ComputersFake>,
): Layer.Layer<Computers> =>
  Layer.effect(
    Computers,
    Effect.gen(function* () {
      // The mark every fake carries: a production build that has it fails.
      yield* Effect.logDebug('kestack-fake: the Computers fake serves');
      const scope = yield* Effect.scope;
      const instances = () => runtime.root.children.computers;

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
      /** When serve first saw each computer, by its Instance: its tunnel checked then. */
      const seen = new Map<string, number>();
      const read = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const all = instances();
        const list: Array<Computer> = [];
        for (const computer of all) {
          const { model } = computer;
          const at = seen.get(computer.address) ?? now;
          seen.set(computer.address, at);
          list.push({
            id: model.id,
            name: model.name,
            email: model.email,
            version: model.version,
            online: model.online,
            silentFor: model.silentFor,
            key: keyOf(model.id),
            status: {
              _tag: 'Ready',
              url: tunnelOf(model.id),
              check: { _tag: 'Reachable', at },
            },
            edges: yield* edgesOf(computer),
          });
        }
        const kept = new Set<string>(all.map(({ address }) => address));
        for (const [address, { scope: own }] of built)
          if (!kept.has(address)) {
            built.delete(address);
            seen.delete(address);
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
      yield* Effect.forkScoped(
        Stream.runForEach(runtime.changes, () =>
          Effect.gen(function* () {
            const now = saying();
            if (now === said) return;
            said = now;
            yield* SubscriptionRef.set(computers, yield* read);
          }),
        ),
      );

      // 3. Told
      return Computers.of({
        changes: SubscriptionRef.changes(computers),
        stopped: (id, why) =>
          Effect.sync(() => {
            instances()
              .find(({ key }) => key === id)
              ?.send({ _tag: 'StoppedOnItsOwn', why });
          }),
      });
    }),
  );
