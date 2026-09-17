import { useEffect, useState } from 'react';
import type { TraceRecorder } from '@pkishorez/effect-tracer/recorder';

const POLL_INTERVAL_MS = 500;

interface RecorderSnapshot {
  readonly spans: ReturnType<TraceRecorder['snapshot']>['spans'];
  readonly logs: ReturnType<TraceRecorder['snapshot']>['logs'];
}

const empty: RecorderSnapshot = { spans: [], logs: [] };

function readSnapshot(recorder: TraceRecorder | undefined): RecorderSnapshot {
  if (!recorder) return empty;
  const trace = recorder.snapshot();
  return { spans: trace.spans, logs: trace.logs };
}

/**
 * Keeps a Recorder's captured Traces current. `TraceRecorder` has no push
 * subscription - spans and logs are only ever readable through `snapshot` -
 * so this polls instead.
 */
export function useRecorderSnapshot(
  recorder: TraceRecorder | undefined,
): RecorderSnapshot {
  const [snapshot, setSnapshot] = useState(() => readSnapshot(recorder));

  useEffect(() => {
    setSnapshot(readSnapshot(recorder));
    if (!recorder) return undefined;
    const id = setInterval(
      () => setSnapshot(readSnapshot(recorder)),
      POLL_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [recorder]);

  return snapshot;
}
