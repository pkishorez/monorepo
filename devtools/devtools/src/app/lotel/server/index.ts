import { Layer } from 'effect';
import { otlpHttpRoute } from './http/otlp/real/index.js';
import { TELEMETRY_RPC_PATH } from './rpc/telemetry/contract/index.js';
import { telemetryRpcRoute } from './rpc/telemetry/real/index.js';
import { sqliteTelemetryStoreLayer } from './services/telemetry-store/real/index.js';

/*
 * The Lotel Tool, the server's side: the OTLP/HTTP receiver any
 * OpenTelemetry exporter posts to, and the Telemetry RPC the Tool reads
 * through, both over one Telemetry Store kept in SQLite.
 */

export interface LotelServerOptions {
  /** The SQLite file the Telemetry Store keeps its own table in, or `:memory:`. */
  readonly db: string;
}

/** Every Lotel route, sharing one Telemetry Store opened at `options.db`. */
export const lotelServer = (options: LotelServerOptions) =>
  Layer.mergeAll(telemetryRpcRoute, otlpHttpRoute).pipe(
    Layer.provide(sqliteTelemetryStoreLayer({ path: options.db })),
  );

/** What each Lotel route is, for `/health`. */
export const lotelEndpoints: Readonly<Record<string, string>> = {
  [TELEMETRY_RPC_PATH]:
    'Lotel RPC: Span Records and Log Records read after an Update Cursor, Traces, and clearing them.',
  '/v1/traces': 'OTLP/HTTP Trace ingestion.',
  '/v1/logs': 'OTLP/HTTP Log Record ingestion.',
};
