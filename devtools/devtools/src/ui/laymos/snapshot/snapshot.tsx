import { useCallback, useState } from 'react';
import { Schema } from 'effect';
import { ArchitectureSnapshot } from 'kui-toolkit/components/blocks/laymos';
import {
  SnapshotRequestJson,
  type SnapshotRequest,
} from '../../../rpc/index.js';

/** Decodes the Snapshot Request the command injected, or explains why not. */
export function readSnapshotRequest(): SnapshotRequest | Error {
  const raw = window.__DEVTOOLS_SNAPSHOT__;
  if (raw === undefined) {
    return new Error(
      'No Snapshot Request was injected. This page is opened by `devtools snapshot`.',
    );
  }
  try {
    return Schema.decodeUnknownSync(SnapshotRequestJson)(raw);
  } catch (error) {
    return new Error(
      `The Snapshot Request does not match the schema: ${String(error)}`,
    );
  }
}

/**
 * Draws one Architecture Snapshot and flags `data-devtools-snapshot="ready"`
 * on the element to capture once the drawing has settled at its final size.
 */
export function LaymosSnapshot({ request }: { request: SnapshotRequest }) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div
      className="inline-block bg-background"
      data-devtools-snapshot={ready ? 'ready' : 'pending'}
    >
      <ArchitectureSnapshot
        analysis={request.analysis}
        changes={request.changes}
        includeUnchanged={request.includeUnchanged}
        maxWidth={request.maxWidth}
        maxHeight={request.maxHeight}
        title={request.title}
        baseLabel={request.baseLabel}
        onReady={onReady}
      />
    </div>
  );
}
