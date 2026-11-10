/*
 * What Connect Cloud keeps, for both jobs. Connections: each User's
 * Connections in the `connections` table, as their Heartbeats left them and
 * their Users renamed or forgot them (connections.ts, over storage/).
 * Releases: what every Connection is told to run, where any Release stands,
 * and the Release Files themselves (releases.ts).
 */

export { Connections } from './connections.js';
export { connectionsTable } from './storage/index.js';
export {
  type Latest,
  RELEASE_PATH,
  releaseFile,
  releaseKey,
  type ReleaseFiles,
  standingOf,
} from './releases.js';
