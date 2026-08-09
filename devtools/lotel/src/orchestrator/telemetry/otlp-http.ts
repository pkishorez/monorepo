import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';
import {
  ExportLogsServiceRequestSchema,
  ExportLogsServiceResponseSchema,
  ExportTraceServiceRequestSchema,
  ExportTraceServiceResponseSchema,
  OtlpBadRequest,
  OtlpInternalError,
} from '../../domain/telemetry-schema/index.js';

export const makeLotelOtlpHttpGroup = () =>
  HttpApiGroup.make('lotelOtlp')
    .add(
      HttpApiEndpoint.post('ingestTraces', '/v1/traces', {
        payload: ExportTraceServiceRequestSchema,
        success: ExportTraceServiceResponseSchema,
        error: [OtlpBadRequest, OtlpInternalError],
      }),
    )
    .add(
      HttpApiEndpoint.post('ingestLogs', '/v1/logs', {
        payload: ExportLogsServiceRequestSchema,
        success: ExportLogsServiceResponseSchema,
        error: [OtlpBadRequest, OtlpInternalError],
      }),
    );
