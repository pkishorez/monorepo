import { Layer } from 'effect';
import { TelemetryStore } from '../contract/index.js';
import { makeSqliteTelemetryStore } from './sqlite.js';

export const sqliteTelemetryStoreLayer = ({ path }: { path: string }) =>
  Layer.effect(TelemetryStore, makeSqliteTelemetryStore(path));
