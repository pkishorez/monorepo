import { Layer } from 'effect';
import { TelemetryStore } from '../contract/index.js';
import { makeSqliteTelemetryStore } from './sqlite.js';

/** The Telemetry Store kept in the SQLite file at `path`, or `:memory:`. */
export const sqliteTelemetryStoreLayer = ({ path }: { path: string }) =>
  Layer.effect(TelemetryStore, makeSqliteTelemetryStore(path));
