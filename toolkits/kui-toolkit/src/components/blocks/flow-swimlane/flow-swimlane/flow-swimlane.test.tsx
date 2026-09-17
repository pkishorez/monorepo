import { Effect } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import type { RecordedFlow } from '../flow-presentation';
import { FlowSwimlane } from './flow-swimlane';
import { flowScenarios } from '../examples/scenarios';

describe('FlowSwimlane', () => {
  it('renders a Flow recorded from a real Effect program', async () => {
    const scenario = flowScenarios[0]!;
    const recorder = makeTraceRecorder({ requireFinishedSpans: true });
    await Effect.runPromise(recorder.instrument(scenario.program()));
    const flow = recorder.snapshotFlow(scenario.id)!;
    const markup = renderToStaticMarkup(<FlowSwimlane flow={flow} />);

    expect(markup).toContain(`data-flow-id="${scenario.id}"`);
    expect(markup).toContain('data-flow-item="activity"');
    expect(markup).toContain('data-flow-item="local-event"');
    expect(markup).toContain('data-flow-item="message"');
    expect(markup).toContain('data-flow-message-connectors="true"');
    expect(markup).toContain('data-flow-activation="completed"');
    expect(markup).toContain('data-flow-item="activation-start"');
    expect(markup).toContain('client-a');
    expect(markup).toContain('signaling-server');
    expect(markup).toContain('client-b');
  });

  it('makes log entries selectable and highlights the selected item', async () => {
    const scenario = flowScenarios[0]!;
    const recorder = makeTraceRecorder({ requireFinishedSpans: true });
    await Effect.runPromise(recorder.instrument(scenario.program()));
    const flow = recorder.snapshotFlow(scenario.id)!;
    const log = flow.items.find((item) => item.kind !== 'activity')!;
    const markup = renderToStaticMarkup(
      <FlowSwimlane
        flow={flow}
        selectedItemId={log.id}
        onItemClick={() => undefined}
      />,
    );

    expect(markup).toContain('data-selected="true"');
    expect(markup).toContain('log entry');
  });

  it('selects an expanded contiguous step by its own ID', () => {
    const flow: RecordedFlow = {
      id: 'sync-flow',
      latestTimestamp: 2,
      activations: [],
      warnings: [],
      items: [
        {
          kind: 'local-event',
          id: 'first-write',
          participantName: 'global',
          name: 'Source of Truth write',
          timestamp: 1,
          severity: 'info',
        },
        {
          kind: 'local-event',
          id: 'second-write',
          participantName: 'global',
          name: 'Source of Truth write',
          timestamp: 2,
          severity: 'info',
        },
      ],
    };

    const markup = renderToStaticMarkup(
      <FlowSwimlane
        flow={flow}
        selectedItemId="second-write"
        onItemClick={() => undefined}
      />,
    );

    expect(markup).toContain('data-selected="true"');
    expect(markup).toContain('Source of Truth write');
    expect(markup).not.toContain('data-flow-item="summary"');
  });

  it('highlights every enclosing Activation and thins nested rails', () => {
    const flow: RecordedFlow = {
      id: 'nested-flow',
      latestTimestamp: 5,
      warnings: [],
      items: [
        {
          kind: 'activation-start',
          id: 'rtc-start',
          participantName: 'alice',
          name: 'RTC connection',
          timestamp: 1,
          severity: 'info',
        },
        {
          kind: 'activation-start',
          id: 'rpc-start',
          participantName: 'alice',
          name: 'RPC GetProfile',
          timestamp: 2,
          severity: 'info',
        },
        {
          kind: 'local-event',
          id: 'selected-node',
          participantName: 'alice',
          name: 'Handle request',
          timestamp: 3,
          severity: 'info',
        },
        {
          kind: 'activation-end',
          id: 'rpc-end',
          participantName: 'alice',
          name: 'RPC completed',
          timestamp: 4,
          severity: 'info',
          outcome: 'completed',
        },
        {
          kind: 'activation-end',
          id: 'rtc-end',
          participantName: 'alice',
          name: 'RTC completed',
          timestamp: 5,
          severity: 'info',
          outcome: 'completed',
        },
      ],
      activations: [
        {
          participantName: 'alice',
          name: 'RTC connection',
          startItemId: 'rtc-start',
          endItemId: 'rtc-end',
          startTimestamp: 1,
          endTimestamp: 5,
          outcome: 'completed',
        },
        {
          participantName: 'alice',
          name: 'RPC GetProfile',
          startItemId: 'rpc-start',
          endItemId: 'rpc-end',
          startTimestamp: 2,
          endTimestamp: 4,
          outcome: 'completed',
        },
      ],
    };

    const markup = renderToStaticMarkup(
      <FlowSwimlane flow={flow} selectedItemId="selected-node" />,
    );

    expect(markup.match(/data-highlighted="true"/g)).toHaveLength(2);
    expect(markup).toContain('data-flow-activation-track="1"');
    expect(markup).toContain('drop-shadow(0 0 7px');
    expect(markup).toContain('width="5"');
  });

  it('renders every Participant Path segment in a compact sticky header', () => {
    const flow: RecordedFlow = {
      id: 'hierarchy',
      latestTimestamp: 1,
      activations: [],
      warnings: [],
      items: [
        {
          kind: 'local-event',
          id: 'event',
          participantName:
            'browser:alice/comments.comment/a-very-long-worker-name-that-must-wrap',
          name: 'Ready',
          timestamp: 1,
          severity: 'info',
        },
      ],
    };

    const markup = renderToStaticMarkup(<FlowSwimlane flow={flow} />);

    expect(markup).toContain('data-flow-header="true"');
    expect(markup).toContain('sticky top-0');
    expect(markup).toContain('browser:alice');
    expect(markup).toContain('comments.comment');
    expect(markup).toContain('a-very-long-worker-name-that-must-wrap');
    expect(markup).toContain('whitespace-nowrap');
    expect(markup).toContain('grid-template-rows:repeat(2, 28px) 44px');
    expect(markup).toContain('grid-template-columns:130px 260px 130px');
  });
});
