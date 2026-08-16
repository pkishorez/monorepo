import { eq } from '@tanstack/react-db';
import { Duration, Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  todoEntity,
  todoSource,
  type Todo,
} from '../support.js';

const seeded: Todo = {
  todoId: 'seeded',
  listId: 'inbox',
  title: 'Already in the inbox',
  done: false,
};

const addedWhileWaiting: Todo = {
  todoId: 'waiting-tab-write',
  listId: 'inbox',
  title: 'Added by the waiting tab',
  done: false,
};

const waitUntil = (predicate: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (predicate()) return true;
      yield* Effect.sleep(Duration.millis(5));
    }
    return false;
  });

const makeSimulation = (releaseWhen: 'hidden' | 'frozen') => {
  const counters = { acquisitions: 0 };
  const simulation = Simulation.make({
    table: storyTable,
    leadership: Simulation.webLocks({ releaseWhen }),
    collections: [
      Simulation.collection({
        entity: todoEntity,
        configure: ({ backend }) => ({
          sync: {
            partitions: {
              listId: (listId) => {
                const inbox = todoSource(backend, String(listId));
                return {
                  strategy: syncStrategy.oldToNew<Todo>({
                    source: ({ live }) =>
                      live({
                        open: ({ cursor }) =>
                          Stream.unwrap(
                            Effect.sync(() => {
                              counters.acquisitions += 1;
                              return inbox.changes(cursor);
                            }),
                          ),
                      }),
                  }),
                };
              },
            },
          },
        }),
      }),
    ] as const,
  });
  return { counters, releaseWhen, simulation };
};

const hidden = makeSimulation('hidden');
const frozen = makeSimulation('frozen');

type LeadershipSimulation = typeof hidden;
type World = Parameters<
  Parameters<LeadershipSimulation['simulation']['run']>[0]
>[0];
type Browser = ReturnType<World['browser']>;
type Tab = ReturnType<Browser['tab']>;

const mountInbox = (tab: Tab) =>
  tab.mount({
    name: 'Inbox partition',
    query: (q) =>
      q
        .from({ todo: tab.collection('Todo') })
        .where(({ todo }) => eq(todo.listId, 'inbox')),
  });

const waitForAcquisitions = (
  simulation: LeadershipSimulation,
  expected: number,
) => waitUntil(() => simulation.counters.acquisitions === expected);

const prepareWaitingTab = (simulation: LeadershipSimulation, tab: Tab) =>
  simulation.releaseWhen === 'hidden'
    ? tab.show
    : Effect.all([tab.resume, tab.show], { discard: true });

const yieldLeadership = (
  simulation: LeadershipSimulation,
  leader: Tab,
  expectedBeforeHandoff: number,
) =>
  Effect.gen(function* () {
    yield* leader.hide;
    if (simulation.releaseWhen === 'frozen') {
      yield* Effect.sleep(Duration.millis(25));
      const hiddenRetainedLeadership =
        simulation.counters.acquisitions === expectedBeforeHandoff;
      yield* leader.freeze;
      return hiddenRetainedLeadership;
    }
    return true;
  });

const runDance = (simulation: LeadershipSimulation) =>
  simulation.simulation.run(({ backend, browser }) =>
    Effect.gen(function* () {
      simulation.counters.acquisitions = 0;
      yield* backend.insert('Todo', seeded);

      const first = browser('alice');
      const second = first.tab('second');
      const firstInbox = yield* mountInbox(first);
      const firstAcquired = yield* waitForAcquisitions(simulation, 1);

      const secondInbox = yield* mountInbox(second);
      yield* firstInbox.eventuallyShows([seeded]);
      yield* second.insert('Todo', addedWhileWaiting);
      yield* firstInbox.eventuallyShows([seeded, addedWhileWaiting]);
      yield* secondInbox.eventuallyShows([seeded, addedWhileWaiting]);
      const secondWaited = simulation.counters.acquisitions === 1;

      const hiddenRetentionChecks = [
        yield* yieldLeadership(simulation, first, 1),
      ];
      const handoffs = [yield* waitForAcquisitions(simulation, 2)];

      yield* prepareWaitingTab(simulation, first);
      hiddenRetentionChecks.push(yield* yieldLeadership(simulation, second, 2));
      handoffs.push(yield* waitForAcquisitions(simulation, 3));

      yield* prepareWaitingTab(simulation, second);
      hiddenRetentionChecks.push(yield* yieldLeadership(simulation, first, 3));
      handoffs.push(yield* waitForAcquisitions(simulation, 4));

      yield* prepareWaitingTab(simulation, first);
      hiddenRetentionChecks.push(yield* yieldLeadership(simulation, second, 4));
      handoffs.push(yield* waitForAcquisitions(simulation, 5));

      return {
        acquisitions: simulation.counters.acquisitions,
        firstAcquired,
        handoffs,
        hiddenRetainedLeadership: hiddenRetentionChecks.every(Boolean),
        releaseWhen: simulation.releaseWhen,
        secondWaited,
      };
    }),
  );

export const yieldingLeadership = Story.make({
  title: 'Two tabs dance for one partition',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How does Leadership move when hidden tabs must yield?', {
      answer:
        'Both tabs stay subscribed to the same inbox partition. Tab one leads while tab two waits and can still write. Each hide immediately releases the Web Lock to the already-focused waiter; showing the old leader queues it for the next handoff. The story performs four handoffs.',
      proof: Effect.gen(function* () {
        const result = yield* runDance(hidden);
        yield* Story.assert(
          'tab one acquired Leadership for the inbox partition',
          result.firstAcquired,
        );
        yield* Story.assert(
          'tab two stayed waiting while both tabs remained subscribed',
          result.secondWaited,
        );
        yield* Story.assert('handoff 1 moved Leadership', result.handoffs[0]!);
        yield* Story.assert('handoff 2 moved Leadership', result.handoffs[1]!);
        yield* Story.assert('handoff 3 moved Leadership', result.handoffs[2]!);
        yield* Story.assert('handoff 4 moved Leadership', result.handoffs[3]!);
        return result;
      }),
    }),
    Story.question('How does Leadership move only when tabs freeze?', {
      answer:
        'Both tabs stay subscribed to the same inbox partition. Hiding the leader does nothing under releaseWhen: frozen. Only freeze releases the Web Lock. Before each freeze, the other tab is resumed and focused, so it acquires Leadership immediately. The story proves this across four handoffs.',
      proof: Effect.gen(function* () {
        const result = yield* runDance(frozen);
        yield* Story.assert(
          'tab one acquired Leadership for the inbox partition',
          result.firstAcquired,
        );
        yield* Story.assert(
          'tab two stayed waiting while both tabs remained subscribed',
          result.secondWaited,
        );
        yield* Story.assert(
          'hiding alone never released Leadership',
          result.hiddenRetainedLeadership,
        );
        yield* Story.assert('freeze handoff 1 completed', result.handoffs[0]!);
        yield* Story.assert('freeze handoff 2 completed', result.handoffs[1]!);
        yield* Story.assert('freeze handoff 3 completed', result.handoffs[2]!);
        yield* Story.assert('freeze handoff 4 completed', result.handoffs[3]!);
        return result;
      }),
    }),
  ],
});
