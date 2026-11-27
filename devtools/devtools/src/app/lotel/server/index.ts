import { Layer } from 'effect';
import { otlpHttpRoute } from './http/otlp/real/index.js';
import { telemetryTools } from './mcp/telemetry/real/index.js';
import { TELEMETRY_RPC_PATH } from './rpc/telemetry/contract/index.js';
import { telemetryRpcRoute } from './rpc/telemetry/real/index.js';
import { sqliteTelemetryStoreLayer } from './services/telemetry-store/real/index.js';
import { tracesLayer } from './services/traces/real/index.js';

export interface LotelServerOptions {
  readonly db: string;
}

export const lotelServer = (options: LotelServerOptions) =>
  Layer.mergeAll(telemetryRpcRoute, otlpHttpRoute, telemetryTools).pipe(
    Layer.provide(tracesLayer),
    Layer.provide(sqliteTelemetryStoreLayer({ path: options.db })),
  );

export const lotelEndpoints: Readonly<Record<string, string>> = {
  [TELEMETRY_RPC_PATH]:
    'Lotel RPC: Span Records and Log Records read after an Update Cursor, Traces, and clearing them.',
  '/v1/traces': 'OTLP/HTTP Trace ingestion.',
  '/v1/logs': 'OTLP/HTTP Log Record ingestion.',
};
