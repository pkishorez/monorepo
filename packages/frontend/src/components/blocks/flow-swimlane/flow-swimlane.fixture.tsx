import { makeFlowExampleFixtures } from './examples';
import { FlowSwimlane } from './flow-swimlane';
import type { RecordedFlow } from './model';

const hierarchyFlow: RecordedFlow = {
  id: 'participant-hierarchy',
  latestTimestamp: 7,
  activations: [],
  warnings: [],
  items: [
    {
      id: 'browser-open',
      kind: 'local-event',
      name: 'Tab opened',
      participantName: 'browser:alice',
      severity: 'info',
      timestamp: 1,
    },
    {
      id: 'subscribe',
      kind: 'message',
      messageId: 'subscribe-1',
      name: 'Subscribe',
      participantName: 'browser:alice',
      destination: 'browser:alice/comments.comment',
      severity: 'info',
      timestamp: 2,
    },
    {
      id: 'collection-state',
      kind: 'state',
      name: 'Collection state',
      participantName: 'browser:alice/comments.comment',
      severity: 'info',
      state: { rows: 12 },
      merged: { rows: 12 },
      timestamp: 3,
    },
    {
      id: 'strategy-attempt',
      kind: 'activity',
      name: 'Strategy attempt',
      participantName:
        'browser:alice/comments.comment/{postid=a-very-long-partition-identity-that-wraps-cleanly}.partition-worker',
      duration: 24,
      status: 'success',
      traceId: 'trace-1',
      spanId: 'span-1',
      timestamp: 4,
    },
    {
      id: 'first-write',
      kind: 'local-event',
      name: 'Sync Replica write',
      participantName:
        'browser:alice/comments.comment/{postid=a-very-long-partition-identity-that-wraps-cleanly}.partition-worker',
      severity: 'info',
      timestamp: 5,
    },
    {
      id: 'second-write',
      kind: 'local-event',
      name: 'Sync Replica write',
      participantName:
        'browser:alice/comments.comment/{postid=a-very-long-partition-identity-that-wraps-cleanly}.partition-worker',
      severity: 'info',
      timestamp: 6,
    },
    {
      id: 'backend-ready',
      kind: 'local-event',
      name: 'Ready',
      participantName: 'backend',
      severity: 'info',
      timestamp: 7,
    },
  ],
};

export default {
  ...makeFlowExampleFixtures(),
  'Participant hierarchy': (
    <div className="h-[680px] bg-background p-4">
      <FlowSwimlane
        flow={hierarchyFlow}
        className="h-full rounded-xl border border-border bg-card"
      />
    </div>
  ),
};
