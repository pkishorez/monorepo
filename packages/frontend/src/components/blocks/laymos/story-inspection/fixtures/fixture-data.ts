import type { StoryReport, StoryTree } from 'laymos';

const start = 1_755_000_000_000;

const eschemaSetup = `const User = ESchema.make('User', {
  name: Schema.String,
})
  .evolve('v2', { age: Schema.Number }, (previous) => ({
    ...previous,
    age: 0,
  }))
  .build();`;

const evolveSource = `import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

${eschemaSetup}

export const evolvesAnEntity = Story.make({
  title: 'Evolves an entity across versions',
  sourceUrl: import.meta.url,
  questions: [/* … */],
});`;

const supportSource = `import { ESchema } from 'std-toolkit/eschema';

export const decodeAll = (schema, rows) =>
  Effect.forEach(rows, (row) => schema.decode(row));`;

export const storyTree: StoryTree = {
  title: 'std-toolkit',
  description: 'Everything std-toolkit does, one proof at a time.',
  page: null,
  groups: [
    {
      title: 'ESchema',
      description:
        'How a schema grows without breaking the rows already written.',
      page: null,
      groups: [],
      stories: [
        {
          id: 'std-toolkit/ESchema/Evolves an entity across versions',
          title: 'Evolves an entity across versions',
          description: 'A v1 row meets a v2 schema and decodes.',
          spine: true,
          page: null,
          setup: eschemaSetup,
          questions: [
            {
              slug: 'what-happens-when-a-v1-row-meets-the-v2-schema',
              question: 'What happens when a v1 row meets the v2 schema?',
              answer: 'It decodes: `age` is backfilled by the v1→v2 migration.',
              snippet: `Effect.gen(function* () {
  const decoded = yield* Story.trace(
    User.decode({ _v: 'v1', name: 'Ada' }),
  );
  yield* Story.assert('age is backfilled', decoded.age === 0);
  return decoded;
})`,
            },
            {
              slug: 'what-happens-to-a-version-that-was-never-declared',
              question: 'What happens to a version that was never declared?',
              answer:
                'Decode fails with a typed error naming the unknown version.',
              snippet: `Effect.gen(function* () {
  const error = yield* User.decode({ _v: 'v9', name: 'Eve' }).pipe(
    Effect.flip,
  );
  yield* Story.assert('the error names v9', String(error).includes('v9'));
  return error;
})`,
            },
          ],
          source: {
            path: 'stories/eschema/evolve.story.ts',
            content: evolveSource,
          },
          support: {
            path: 'stories/eschema/support.ts',
            content: supportSource,
          },
        },
      ],
    },
    {
      title: 'Sync',
      description: 'How a mutation travels and how state survives a crash.',
      page: null,
      groups: [],
      stories: [
        {
          id: 'std-toolkit/Sync/Round-trips a mutation',
          title: 'Round-trips a mutation',
          description: 'A pushed mutation is acknowledged and folded in.',
          spine: true,
          page: null,
          setup: null,
          questions: [
            {
              slug: 'what-happens-after-a-mutation-is-pushed',
              question: 'What happens after a mutation is pushed?',
              answer:
                'The server acknowledges it and the snapshot folds it in.',
              snippet: `Effect.gen(function* () {
  const snapshot = yield* Story.flow(pushAndAwaitAck(mutation));
  yield* Story.assert('no pending mutations remain', snapshot.pending === 0);
  return snapshot;
})`,
            },
          ],
          source: {
            path: 'stories/sync/round-trip.story.ts',
            content: '// …',
          },
          support: null,
        },
        {
          id: 'std-toolkit/Sync/Restores after a crash',
          title: 'Restores after a crash',
          description: 'An unclean shutdown loses nothing.',
          spine: false,
          page: null,
          setup: null,
          questions: [
            {
              slug: 'what-happens-on-restart-after-an-unclean-shutdown',
              question: 'What happens on restart after an unclean shutdown?',
              answer: 'The latest snapshot revives local state.',
              snippet: `Effect.gen(function* () {
  const restored = yield* restoreFromSnapshot();
  yield* Story.assert('state is revived', restored.items.length > 0);
  return restored;
})`,
            },
          ],
          source: {
            path: 'stories/sync/restore.story.ts',
            content: '// …',
          },
          support: null,
        },
      ],
    },
  ],
  stories: [],
};

export const storyReports: Readonly<Record<string, StoryReport>> = {
  'std-toolkit/ESchema/Evolves an entity across versions': {
    id: 'std-toolkit/ESchema/Evolves an entity across versions',
    verdict: 'passed',
    questions: [
      {
        slug: 'what-happens-when-a-v1-row-meets-the-v2-schema',
        verdict: 'passed',
        result: { _v: 'v2', name: 'Ada', age: 0 },
        assertions: [{ description: 'age is backfilled', passed: true }],
        sections: [
          {
            kind: 'trace',
            trace: {
              spans: [
                {
                  traceId: 't1',
                  spanId: 's1',
                  parentSpanId: null,
                  name: 'decode-v1-user',
                  startTime: start,
                  endTime: start + 12,
                  status: 'success',
                  attributes: {},
                  events: [],
                },
                {
                  traceId: 't1',
                  spanId: 's2',
                  parentSpanId: 's1',
                  name: 'migrate v1 -> v2',
                  startTime: start + 2,
                  endTime: start + 9,
                  status: 'success',
                  attributes: {},
                  events: [],
                },
              ],
              logs: [],
              truncated: false,
            },
          },
        ],
      },
      {
        slug: 'what-happens-to-a-version-that-was-never-declared',
        verdict: 'passed',
        result: "DecodeError: unknown version 'v9'",
        assertions: [{ description: 'the error names v9', passed: true }],
        sections: [],
      },
    ],
  },
  'std-toolkit/Sync/Round-trips a mutation': {
    id: 'std-toolkit/Sync/Round-trips a mutation',
    verdict: 'failed',
    questions: [
      {
        slug: 'what-happens-after-a-mutation-is-pushed',
        verdict: 'failed',
        result: { pending: 1 },
        assertions: [
          { description: 'no pending mutations remain', passed: false },
        ],
        sections: [
          {
            kind: 'flow',
            flow: {
              id: 'sync-1',
              latestTimestamp: start + 40,
              items: [
                {
                  kind: 'message',
                  id: 'f1',
                  participantName: 'client',
                  name: 'push mutation',
                  timestamp: start,
                  severity: 'info',
                  destination: 'server',
                  messageId: 'm1',
                },
                {
                  kind: 'activity',
                  id: 'f2',
                  participantName: 'server',
                  name: 'apply mutation',
                  timestamp: start + 10,
                  duration: 20,
                  status: 'success',
                  traceId: 't2',
                  spanId: 's3',
                },
                {
                  kind: 'message',
                  id: 'f3',
                  participantName: 'server',
                  name: 'ack',
                  timestamp: start + 35,
                  severity: 'info',
                  destination: 'client',
                  messageId: 'm2',
                  replyTo: 'm1',
                },
              ],
              activations: [
                {
                  participantName: 'server',
                  name: 'Handle mutation',
                  startItemId: 'f2',
                  endItemId: 'f3',
                  startTimestamp: start + 10,
                  endTimestamp: start + 35,
                  outcome: 'completed',
                },
              ],
              warnings: [],
            },
          },
        ],
      },
    ],
  },
  'std-toolkit/Sync/Restores after a crash': {
    id: 'std-toolkit/Sync/Restores after a crash',
    verdict: 'errored',
    questions: [
      {
        slug: 'what-happens-on-restart-after-an-unclean-shutdown',
        verdict: 'errored',
        error: 'Error: boom\n    at restoreSnapshot (snapshot.ts:42)',
        assertions: [],
        sections: [],
      },
    ],
  },
};
