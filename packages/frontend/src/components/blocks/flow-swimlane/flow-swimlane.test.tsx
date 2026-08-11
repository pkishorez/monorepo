import { Effect } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
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
    expect(markup).toContain('data-flow-terminal="completed"');
    expect(markup).toContain('client-a');
    expect(markup).toContain('signaling-server');
    expect(markup).toContain('client-b');
  });
});
