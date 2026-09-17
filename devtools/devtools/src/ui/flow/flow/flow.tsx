import { useCallback, useMemo, useState } from 'react';
import { Effect } from 'effect';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';
import { buildFlowCollections } from '../collections.js';
import { Viewer } from '../viewer/index.js';

/** The Flow Tool: a live Journal inspector drawn as swim lanes. */
export function Flow() {
  const runtime = useDevtoolsRuntime();
  const [resetKey, setResetKey] = useState(0);
  const collections = useMemo(() => buildFlowCollections(), [resetKey]);

  const clearFlows = useCallback(async () => {
    const { deleted } = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* DevtoolsClient;
        return yield* client.ClearFlows({});
      }),
    );
    setResetKey((key) => key + 1);
    return deleted;
  }, [runtime]);

  return (
    <Viewer key={resetKey} collections={collections} onClear={clearFlows} />
  );
}
