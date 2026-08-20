import { eq } from '@tanstack/react-db';
import { Duration, Effect, Stream } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  noteEntity,
  noteSource,
  type Note,
} from '../support.js';

const seeded: Note = {
  noteId: 'seeded',
  notebook: 'inbox',
  title: 'Already in the inbox',
  pinned: false,
};

const addedWhileWaiting: Note = {
  noteId: 'waiting-tab-write',
  notebook: 'inbox',
  title: 'Added by the waiting tab',
  pinned: false,
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
        entity: noteEntity,
        configure: ({ backend }) => ({
          sync: {
            partitions: {
              notebook: (notebook) => {
                const inbox = noteSource(backend, String(notebook));
                return {
                  strategy: syncStrategy.oldToNew<Note>({
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
        .from({ note: tab.collection('Note') })
        .where(({ note }) => eq(note.notebook, 'inbox')),
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
      yield* backend.insert('Note', seeded);

      const first = browser('alice');
      const second = first.tab('second');
      const firstInbox = yield* mountInbox(first);
      const firstAcquired = yield* waitForAcquisitions(simulation, 1);

      const secondInbox = yield* mountInbox(second);
      yield* firstInbox.eventuallyShows([seeded]);
      yield* second.insert('Note', addedWhileWaiting);
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
  description: 'Hiding a tab passes leadership to a tab that is waiting.',
  setupNote:
    'The table, the Note, and the collection that the simulation uses. `Simulation.make` builds the world, and `simulation.run` runs one script inside it. `Simulation.webLocks()` supplies leadership through web locks. The release rule is `hidden` in one Story and `frozen` in the other.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does leadership move when a hidden tab must release it?',
      {
        answer:
          'Both tabs watch the same notebook. Tab one leads. Tab two waits and can still write. Each hide releases the lock at once to the tab that is already in front. Showing the old leader puts it in the queue for the next handover. This Story performs four handovers.',
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
          yield* Story.assert(
            'handoff 1 moved Leadership',
            result.handoffs[0]!,
          );
          yield* Story.assert(
            'handoff 2 moved Leadership',
            result.handoffs[1]!,
          );
          yield* Story.assert(
            'handoff 3 moved Leadership',
            result.handoffs[2]!,
          );
          yield* Story.assert(
            'handoff 4 moved Leadership',
            result.handoffs[3]!,
          );
          return result;
        }),
      },
    ),
    Story.question(
      'How does leadership move when only a frozen tab releases it?',
      {
        answer:
          'Both tabs watch the same notebook. Under this rule, hiding the leader does nothing. Only a freeze releases the lock. Before each freeze, the other tab is resumed so that it can take the lock.',
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
          yield* Story.assert(
            'freeze handoff 1 completed',
            result.handoffs[0]!,
          );
          yield* Story.assert(
            'freeze handoff 2 completed',
            result.handoffs[1]!,
          );
          yield* Story.assert(
            'freeze handoff 3 completed',
            result.handoffs[2]!,
          );
          yield* Story.assert(
            'freeze handoff 4 completed',
            result.handoffs[3]!,
          );
          return result;
        }),
      },
    ),
  ],
});
