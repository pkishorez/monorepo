import { useCallback, useState } from 'react';
import { ArchitectureSnapshot } from 'kui-toolkit/components/blocks/laymos';
import {
  decodeRequest,
  type SnapshotRequest,
} from '../../../domain/snapshot/index.js';

/** Decodes the Snapshot Request the command injected, or explains why not. */
export function readSnapshotRequest(): SnapshotRequest | Error {
  return decodeRequest(window);
}

/**
 * Draws one Architecture Snapshot and flags `data-devtools-snapshot="ready"`
 * on the element to capture once the drawing has settled at its final size.
 */
export function LaymosSnapshot({ request }: { request: SnapshotRequest }) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const { theme: _theme, ...drawing } = request;
  return (
    <div
      className="inline-block bg-background"
      data-devtools-snapshot={ready ? 'ready' : 'pending'}
    >
      <ArchitectureSnapshot {...drawing} onReady={onReady} />
    </div>
  );
}
