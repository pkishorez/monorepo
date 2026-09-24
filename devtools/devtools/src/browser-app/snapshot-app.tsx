import { useMemo } from 'react';
import {
  LaymosSnapshot,
  readSnapshotRequest,
} from '../ui/laymos/snapshot/index.js';

/**
 * The page `devtools snapshot` opens in a headless browser: no router, no
 * RPC, no theme toggle. It draws the injected Snapshot Request once and marks
 * itself ready or failed for the command to read.
 */
export function SnapshotApp() {
  const request = useMemo(readSnapshotRequest, []);
  if (request instanceof Error) {
    return (
      <pre
        data-devtools-snapshot="error"
        className="m-4 whitespace-pre-wrap font-mono text-sm text-destructive"
      >
        {request.message}
      </pre>
    );
  }
  document.documentElement.classList.toggle('dark', request.theme === 'dark');
  return <LaymosSnapshot request={request} />;
}
