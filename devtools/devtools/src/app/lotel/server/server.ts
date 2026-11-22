import { Layer } from 'effect';
import { LOTEL_RPC_PATH } from '../contract/index.js';
import { lotelIngestRoute } from './ingest/index.js';
import { lotelRpcRoute } from './rpc/index.js';
import { sqliteTelemetryStoreLayer } from './telemetry-store/index.js';

/*
 * The Lotel Tool, the server's side: the OTLP/HTTP receiver any
 * OpenTelemetry exporter posts to, and the Lotel RPC the Tool reads
 * through, both over one Telemetry Store kept in SQLite.
 */

export interface LotelServerOptions {
  /** The SQLite file the Telemetry Store keeps its own table in, or `:memory:`. */
  readonly db: string;
}

/** Every Lotel route, sharing one Telemetry Store opened at `options.db`. */
export const lotelServer = (options: LotelServerOptions) =>
  Layer.mergeAll(lotelRpcRoute, lotelIngestRoute).pipe(
    Layer.provide(sqliteTelemetryStoreLayer({ path: options.db })),
  );

/** What each Lotel route is, for `/health`. */
export const lotelEndpoints: Readonly<Record<string, string>> = {
  [LOTEL_RPC_PATH]:
    'Lotel RPC: Span Records and Log Records read after an Update Cursor, Traces, and clearing them.',
  '/v1/traces': 'OTLP/HTTP Trace ingestion.',
  '/v1/logs': 'OTLP/HTTP Log Record ingestion.',
};
