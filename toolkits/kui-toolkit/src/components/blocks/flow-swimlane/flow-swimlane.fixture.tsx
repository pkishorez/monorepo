import { makeFlowExampleFixtures } from './examples';
import { FlowSwimlane } from './flow-swimlane';
import type { RecordedFlow } from './flow-presentation';

const worker =
  'browser:alice/comments.comment/{postid=a-very-long-partition-identity-that-wraps-cleanly}.partition-worker';

const entry = <K extends RecordedFlow['items'][number]['kind']>(
  kind: K,
  fields: Omit<
    Extract<RecordedFlow['items'][number], { kind: K }>,
    'kind' | 'flowId' | 'sequence' | 'severity'
  > & { severity?: 'info' | 'warning' | 'error' | 'debug' },
): RecordedFlow['items'][number] =>
  ({
    kind,
    flowId: 'participant-hierarchy',
    sequence: fields.timestamp,
    severity: 'info',
    ...fields,
  }) as RecordedFlow['items'][number];

const hierarchyFlow: RecordedFlow = {
  id: 'participant-hierarchy',
  ordering: 'recorded',
  latestTimestamp: 7,
  status: 'quiet',
  participants: [
    'browser:alice',
    'browser:alice/comments.comment',
    worker,
    'backend',
  ],
  activations: [],
  waits: [],
  warnings: [],
  items: [
    entry('event', {
      id: 'browser-open',
      name: 'Tab opened',
      participantName: 'browser:alice',
      timestamp: 1,
    }),
    entry('message', {
      id: 'subscribe',
      messageId: 'subscribe-1',
      name: 'Subscribe',
      participantName: 'browser:alice',
      destination: 'browser:alice/comments.comment',
      timestamp: 2,
    }),
    entry('check', {
      id: 'strategy-attempt',
      name: 'Strategy attempt',
      participantName: worker,
      passed: true,
      timestamp: 4,
    }),
    entry('event', {
      id: 'first-write',
      name: 'Sync Replica write',
      participantName: worker,
      timestamp: 5,
    }),
    entry('event', {
      id: 'second-write',
      name: 'Sync Replica write',
      participantName: worker,
      timestamp: 6,
    }),
    entry('event', {
      id: 'backend-ready',
      name: 'Ready',
      participantName: 'backend',
      timestamp: 7,
    }),
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
