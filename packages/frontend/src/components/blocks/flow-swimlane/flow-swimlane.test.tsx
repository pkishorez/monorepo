import { Effect } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import type { RecordedFlow } from './model';
import { FlowSwimlane } from './flow-swimlane';
import { flowScenarios } from './examples/scenarios';

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

  it('selects a consolidated summary by any member ID', () => {
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
    expect(markup).toContain('Source of Truth write ×2');
  });
});
