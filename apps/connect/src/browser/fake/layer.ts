import {
  Clock,
  Effect,
  Exit,
  Layer,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import {
  type Disk,
  fileSystemOver,
} from '../../connection/plugins/code/engine/services/file-system/fake/index.js';
import { fakeGit } from '../../connection/plugins/code/engine/services/git/fake/index.js';
import {
  type Computer,
  type ComputerEdges,
  Computers,
  tunnelOf,
} from '../computers/index.js';
import type { ComputerState, ComputersState } from './computers.js';

/*
 * `Computers` over the Computers fake's state: what Connect in the tab
 * reads of the outside world.
 *
 * 1. Edges  each computer's File System is over its disk in the state,
 *           and its git the Git fake over it, built once per computer in a
 *           Scope of its own that lasts until the computer is removed.
 * 2. Read   each computer in the state is read into a `Computer`: its own
 *           Connection Key, and its tunnel Ready and reached at its
 *           address, checked when the Layer first saw it. The list is told
 *           again only when what it says changes, not at every file the
 *           code Plugin writes.
 * 3. Told   a computer whose `ke-connect` stopped on its own has it said
 *           in the state, until it comes online again.
 */

type State = SubscriptionRef.SubscriptionRef<ComputersState>;

/** A computer's Connection Key. */
const keyOf = (id: string) => `fake-key-${id}`;

/** What the computers in the state say to Connect in the tab: all but why each stopped, and its disk. */
const sayingOf = ({ computers }: ComputersState) =>
  JSON.stringify(
    computers.map(({ id, name, email, version, online, silentFor }) => [
      id,
      name,
      email,
      version,
      online,
      silentFor,
    ]),
  );

/** Computer `id` changed by `change`; false, nothing changed, when no computer has it. */
const changeIn = (
  state: State,
  id: string,
  change: (computer: ComputerState) => ComputerState,
) =>
  SubscriptionRef.modify(state, (now) => {
    if (!now.computers.some((each) => each.id === id)) return [false, now];
    const computers = now.computers.map((each) =>
      each.id === id ? change(each) : each,
    );
    return [true, { ...now, computers }];
  });

/** Computer `id`'s disk in the state: as it last was once the computer is gone, and no longer changed. */
const diskIn = (state: State, id: string, first: ComputerState): Disk => {
  let last = first.disk;
  return {
    read: Effect.map(SubscriptionRef.get(state), ({ computers }) => {
      last = computers.find((each) => each.id === id)?.disk ?? last;
      return last;
    }),
    update: (change) =>
      Effect.flatMap(
        changeIn(state, id, (computer) => ({
          ...computer,
          disk: change(computer.disk),
        })),
        (changed) =>
          changed ? Effect.void : Effect.fail('The computer is gone'),
      ),
  };
};

/** `Computers` over the Computers fake's state, for as long as the Layer. */
export const computersOver = (state: State): Layer.Layer<Computers> =>
  Layer.effect(
    Computers,
    Effect.gen(function* () {
      // The mark every fake carries: a production build that has it fails.
      yield* Effect.logDebug('kestack-fake: the Computers fake serves');
      const scope = yield* Effect.scope;

      // 1. Edges
      const built = new Map<
        string,
        {
          readonly scope: Scope.Closeable;
          readonly edges: Layer.Layer<ComputerEdges>;
        }
      >();
      const edgesOf = (computer: ComputerState) =>
        Effect.gen(function* () {
          const found = built.get(computer.id);
          if (found !== undefined) return found.edges;
          const own = yield* Scope.fork(scope);
          const files = fileSystemOver(diskIn(state, computer.id, computer));
          const context = yield* Layer.buildWithScope(
            Layer.merge(files, fakeGit.pipe(Layer.provide(files))),
            own,
          );
          const edges = Layer.succeedContext(context);
          built.set(computer.id, { scope: own, edges });
          return edges;
        });

      // 2. Read
      /** When the Layer first saw each computer, by its id: its tunnel checked then. */
      const seen = new Map<string, number>();
      const read = (now: ComputersState) =>
        Effect.gen(function* () {
          const at = yield* Clock.currentTimeMillis;
          const list: Array<Computer> = [];
          for (const computer of now.computers) {
            const { id } = computer;
            const checked = seen.get(id) ?? at;
            seen.set(id, checked);
            list.push({
              id,
              name: computer.name,
              email: computer.email,
              version: computer.version,
              online: computer.online,
              silentFor: computer.silentFor,
              key: keyOf(id),
              status: {
                _tag: 'Ready',
                url: tunnelOf(id),
                check: { _tag: 'Reachable', at: checked },
              },
              edges: yield* edgesOf(computer),
            });
          }
          const kept = new Set(now.computers.map(({ id }) => id));
          for (const [id, { scope: own }] of built)
            if (!kept.has(id)) {
              built.delete(id);
              seen.delete(id);
              yield* Scope.close(own, Exit.void);
            }
          return list;
        });
      const first = yield* SubscriptionRef.get(state);
      let said = sayingOf(first);
      const computers = yield* SubscriptionRef.make(yield* read(first));
      yield* Effect.forkScoped(
        Stream.runForEach(SubscriptionRef.changes(state), (now) =>
          Effect.gen(function* () {
            const saying = sayingOf(now);
            if (saying === said) return;
            said = saying;
            yield* SubscriptionRef.set(computers, yield* read(now));
          }),
        ),
      );

      // 3. Told
      return Computers.of({
        changes: SubscriptionRef.changes(computers),
        stopped: (id, why) =>
          Effect.asVoid(
            changeIn(state, id, (computer) => ({ ...computer, stopped: why })),
          ),
      });
    }),
  );
