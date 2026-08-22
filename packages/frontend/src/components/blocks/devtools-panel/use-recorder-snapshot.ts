import { useEffect, useState } from 'react';
import type { TraceRecorder } from '@pkishorez/effect-tracer/recorder';

const POLL_INTERVAL_MS = 500;

interface RecorderSnapshot {
  readonly spans: ReturnType<TraceRecorder['snapshot']>['spans'];
  readonly logs: ReturnType<TraceRecorder['snapshot']>['logs'];
  readonly flows: ReturnType<TraceRecorder['snapshotFlows']>;
}

function readSnapshot(recorder: TraceRecorder): RecorderSnapshot {
  const trace = recorder.snapshot();
  return {
    spans: trace.spans,
    logs: trace.logs,
    flows: recorder.snapshotFlows(),
  };
}

/**
 * Keeps a Recorder's captured Traces and Flows current. `TraceRecorder` has
 * no push subscription - spans and logs are only ever readable through
 * `snapshot`/`snapshotFlows` - so this polls instead.
 */
export function useRecorderSnapshot(recorder: TraceRecorder): RecorderSnapshot {
  const [snapshot, setSnapshot] = useState(() => readSnapshot(recorder));

  useEffect(() => {
    setSnapshot(readSnapshot(recorder));
    const id = setInterval(
      () => setSnapshot(readSnapshot(recorder)),
      POLL_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [recorder]);

  return snapshot;
}
