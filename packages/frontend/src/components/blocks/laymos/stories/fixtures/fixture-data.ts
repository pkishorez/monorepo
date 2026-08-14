import type { StoryReport, StoryTree } from 'laymos';

const start = 1_755_000_000_000;

export const storyTree: StoryTree = {
  title: 'std-toolkit',
  description: 'Database-agnostic sync over single-table item collections.',
  markdown: `
std-toolkit layers a synchronizable data toolkit over any database that can
store sorted items in a single table. Schemas evolve in place, snapshots
capture state, and sync flows move changes between peers.

The groups below walk through each capability with executable stories.
`,
  docs: [],
  groups: [
    {
      title: 'ESchema',
      description: 'Versioned entity schemas that migrate old data forward.',
      markdown: `
\`EntityESchema\` declares an entity's shape per version. Every \`evolve\`
step records how to migrate the previous version forward, so decoding any
historical payload yields the latest shape.
`,
      docs: [],
      groups: [],
      stories: [
        {
          id: 'std-toolkit/ESchema/Evolves an entity across versions',
          title: 'Evolves an entity across versions',
          description: 'Old rows stay readable as the schema grows.',
          markdown:
            'Decoding a v1 payload migrates it forward through every `evolve` step, so old rows stay readable after the schema grows an `age` field.',
        },
        {
          id: 'std-toolkit/ESchema/Rejects an unknown version tag',
          title: 'Rejects an unknown version tag',
          description: 'Decoding fails loudly for versions never declared.',
          markdown:
            'A payload tagged with a version the schema never declared is refused with a typed decode error instead of being silently coerced.',
        },
      ],
    },
    {
      title: 'Sync',
      description: 'Mutations round-trip between client and server.',
      markdown: `
The sync layer pushes local mutations to the server, folds acknowledgements
back into the local snapshot, and reconciles concurrent writes.
`,
      docs: [],
      groups: [],
      stories: [
        {
          id: 'std-toolkit/Sync/Round-trips a mutation',
          title: 'Round-trips a mutation',
          description: 'Push, acknowledge, and fold back into the snapshot.',
          markdown:
            'A client mutation is pushed to the server, acknowledged, and folded back into the local snapshot.',
        },
        {
          id: 'std-toolkit/Sync/Restores after a crash',
          title: 'Restores after a crash',
          description: 'The latest snapshot revives local state.',
          markdown:
            'Restoring from the latest snapshot rebuilds local state after an unclean shutdown.',
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
    sections: [
      {
        kind: 'trace',
        description: 'decode a v1 payload with the latest schema',
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
        assertions: [
          { description: 'the v1 row is migrated to v2', passed: true },
          { description: 'the migration backfills age', passed: true },
        ],
      },
      {
        kind: 'exec',
        description: 'identity survives a re-encode round trip',
        assertions: [
          { description: 'encoding yields the v2 tag', passed: true },
          { description: 'the id is unchanged', passed: true },
        ],
      },
    ],
  },
  'std-toolkit/ESchema/Rejects an unknown version tag': {
    id: 'std-toolkit/ESchema/Rejects an unknown version tag',
    verdict: 'passed',
    sections: [
      {
        kind: 'exec',
        description: 'decode a payload tagged v9',
        assertions: [
          { description: 'decoding a v9 payload fails', passed: true },
          { description: 'the error names the unknown version', passed: true },
        ],
      },
    ],
  },
  'std-toolkit/Sync/Round-trips a mutation': {
    id: 'std-toolkit/Sync/Round-trips a mutation',
    verdict: 'failed',
    sections: [
      {
        kind: 'flow',
        description: 'push one mutation and fold back the ack',
        flow: {
          id: 'sync-1',
          status: 'completed',
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
            },
          ],
          warnings: [],
        },
        assertions: [
          { description: 'the snapshot contains the mutation', passed: true },
          { description: 'no pending mutations remain', passed: false },
        ],
      },
    ],
  },
  'std-toolkit/Sync/Restores after a crash': {
    id: 'std-toolkit/Sync/Restores after a crash',
    verdict: 'errored',
    sections: [
      {
        kind: 'exec',
        description: 'restore from the latest snapshot',
        assertions: [{ description: 'snapshot exists on disk', passed: true }],
      },
    ],
    error: 'Error: boom\n    at restoreSnapshot (snapshot.ts:42)',
  },
};
