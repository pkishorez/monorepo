import { Schema } from 'effect';
import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

import { committedOnly, countChangedModules } from './changes.js';
import { SnapshotRequestJson, type SnapshotRequest } from './schema.js';

export { snapshotThemes, type SnapshotRequest } from './schema.js';

// The global the command sets before the page runs and the page reads back.
const requestGlobal = '__DEVTOOLS_SNAPSHOT__';

/**
 * Decides what one Snapshot draws: only committed changes are marked, and
 * `drawn` says whether the picture holds the changed Modules, every Module,
 * or nothing at all.
 */
export function planSnapshot(
  analysis: ArchitectureAnalysis,
  changeSet: ChangeSet,
  options: {
    readonly includeUnchanged: boolean;
    readonly onlyChanged: boolean;
  },
) {
  const changes = committedOnly(changeSet);
  const changedModules = countChangedModules(analysis, changes);
  const drawn: 'none' | 'changed' | 'all' =
    changedModules === 0
      ? options.onlyChanged
        ? 'none'
        : 'all'
      : options.includeUnchanged
        ? 'all'
        : 'changed';
  return {
    changes,
    modules: analysis.moduleAnalysis.modules.length,
    changedModules,
    drawn,
  };
}

/** The script that hands `request` to the Snapshot page before it runs. */
export function requestScript(request: SnapshotRequest): string {
  const json = Schema.encodeSync(SnapshotRequestJson)(request);
  return `window.${requestGlobal} = ${JSON.stringify(json)};`;
}

/** Reads the request `requestScript` handed over, or explains why not. */
export function decodeRequest(globals: object): SnapshotRequest | Error {
  const raw: unknown = Reflect.get(globals, requestGlobal);
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
