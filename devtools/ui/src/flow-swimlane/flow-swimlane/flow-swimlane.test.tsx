import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RecordedFlow } from '../flow-presentation';
import { FlowSwimlane } from './flow-swimlane';
import { recordScenario } from '../examples/runner';
import { flowScenarios } from '../examples/scenarios';

const projectionOf = (
  items: RecordedFlow['items'],
  id = 'flow',
): RecordedFlow => ({
  id,
  ordering: 'recorded',
  latestTimestamp: items.at(-1)?.timestamp ?? 0,
  status: 'quiet',
  participants: [...new Set(items.map((item) => item.participantName))],
  items,
  activations: [],
  waits: [],
  warnings: [],
});

describe('FlowSwimlane', () => {
  it('renders a Flow recorded from a real Effect program', async () => {
    const scenario = flowScenarios[0]!;
    const flow = (await recordScenario(scenario))!;
    const markup = renderToStaticMarkup(<FlowSwimlane flow={flow} />);

    expect(markup).toContain(`data-flow-id="${scenario.id}"`);
    expect(markup).toContain('data-flow-item="event"');
    expect(markup).toContain('data-flow-item="message"');
    expect(markup).toContain('data-flow-message-connectors="true"');
    expect(markup).toContain('data-flow-item="check"');
    expect(markup).toContain('data-flow-item="wait"');
    expect(markup).toContain('data-flow-wait="resumed"');
    expect(markup).toContain('data-flow-activation="completed"');
    expect(markup).toContain('data-flow-item="activation-start"');
    expect(markup).toContain('client-a');
    expect(markup).toContain('signaling-server');
    expect(markup).toContain('client-b');
  });

  it('makes log entries selectable and highlights the selected item', async () => {
    const scenario = flowScenarios[0]!;
    const flow = (await recordScenario(scenario))!;
    const log = flow.items.find((item) => item.kind === 'event')!;
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
    const flow = projectionOf(
      [
        {
          kind: 'event',
          id: 'first-write',
          flowId: 'sync-flow',
          sequence: 1,
          participantName: 'global',
          name: 'Source of Truth write',
          timestamp: 1,
          severity: 'info',
        },
        {
          kind: 'event',
          id: 'second-write',
          flowId: 'sync-flow',
          sequence: 2,
          participantName: 'global',
          name: 'Source of Truth write',
          timestamp: 2,
          severity: 'info',
        },
      ],
      'sync-flow',
    );

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
      ordering: 'recorded',
      latestTimestamp: 5,
      status: 'quiet',
      participants: ['alice'],
      warnings: [],
      waits: [],
      items: [
        {
          kind: 'activation-start',
          id: 'rtc-start',
          flowId: 'nested-flow',
          sequence: 1,
          participantName: 'alice',
          name: 'RTC connection',
          timestamp: 1,
          severity: 'info',
          activationId: 'rtc',
        },
        {
          kind: 'activation-start',
          id: 'rpc-start',
          flowId: 'nested-flow',
          sequence: 2,
          participantName: 'alice',
          name: 'RPC GetProfile',
          timestamp: 2,
          severity: 'info',
          activationId: 'rpc',
        },
        {
          kind: 'event',
          id: 'selected-node',
          flowId: 'nested-flow',
          sequence: 3,
          participantName: 'alice',
          name: 'Handle request',
          timestamp: 3,
          severity: 'info',
        },
        {
          kind: 'activation-end',
          id: 'rpc-end',
          flowId: 'nested-flow',
          sequence: 4,
          participantName: 'alice',
          name: 'RPC completed',
          timestamp: 4,
          severity: 'info',
          activationId: 'rpc',
          outcome: 'completed',
        },
        {
          kind: 'activation-end',
          id: 'rtc-end',
          flowId: 'nested-flow',
          sequence: 5,
          participantName: 'alice',
          name: 'RTC completed',
          timestamp: 5,
          severity: 'info',
          activationId: 'rtc',
          outcome: 'completed',
        },
      ],
      activations: [
        {
          activationId: 'rtc',
          participantName: 'alice',
          name: 'RTC connection',
          startItemId: 'rtc-start',
          endItemId: 'rtc-end',
          startTimestamp: 1,
          endTimestamp: 5,
          outcome: 'completed',
        },
        {
          activationId: 'rpc',
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
    const flow = projectionOf(
      [
        {
          kind: 'event',
          id: 'event',
          flowId: 'hierarchy',
          sequence: 1,
          participantName:
            'browser:alice/comments.comment/a-very-long-worker-name-that-must-wrap',
          name: 'Ready',
          timestamp: 1,
          severity: 'info',
        },
      ],
      'hierarchy',
    );

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
