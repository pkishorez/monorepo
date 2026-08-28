import { useCallback, useMemo, useState } from 'react';
import { Effect } from 'effect';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';
import { buildTelemetryCollections } from '../collections.js';
import { Viewer } from '../viewer/index.js';

/** The Lotel Tool: a live Trace, Log Record, and Flow inspector. */
export function Lotel() {
  const runtime = useDevtoolsRuntime();
  const [resetKey, setResetKey] = useState(0);
  const collections = useMemo(() => buildTelemetryCollections(), [resetKey]);

  const clearTelemetry = useCallback(async () => {
    const { deleted } = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* DevtoolsClient;
        return yield* client.ClearTelemetry({});
      }),
    );
    setResetKey((key) => key + 1);
    return deleted;
  }, [runtime]);

  return (
    <Viewer key={resetKey} collections={collections} onClear={clearTelemetry} />
  );
}
