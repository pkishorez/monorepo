import { Cause, Clock, Logger, References } from 'effect';
import { OtlpResource } from 'effect/unstable/observability';
import type { RequestQueue } from './request-queue.js';
import { nextSequence, sequenceAttribute } from '../../sequence/index.js';

interface LogExporterOptions {
  readonly queue: RequestQueue;
  readonly url: string;
  readonly resource: OtlpResource.Resource;
  readonly scope: { readonly name: string };
  readonly clock: Clock.Clock;
}

const severityNumber = (level: string) => {
  switch (level) {
    case 'Trace':
      return 1;
    case 'Debug':
      return 5;
    case 'Info':
      return 9;
    case 'Warn':
      return 13;
    case 'Error':
      return 17;
    case 'Fatal':
      return 21;
    default:
      return 0;
  }
};

/** Creates the Effect logger that exports one OTLP request per log record. */
export const makeLogger = (options: LogExporterOptions) =>
  Logger.make<unknown, void>((logOptions) => {
    const now = String(options.clock.currentTimeNanosUnsafe());
    const annotations = logOptions.fiber.getRef(
      References.CurrentLogAnnotations,
    );
    const attributes = OtlpResource.entriesToAttributes([
      ...Object.entries(annotations),
      [sequenceAttribute, nextSequence()],
    ]);
    if (logOptions.cause.reasons.length > 0) {
      attributes.push({
        key: 'log.error',
        value: { stringValue: Cause.pretty(logOptions.cause) },
      });
    }

    const message = Array.isArray(logOptions.message)
      ? logOptions.message
      : [logOptions.message];
    const currentSpan = logOptions.fiber.currentSpan;

    options.queue.offer({
      url: options.url,
      body: {
        resourceLogs: [
          {
            resource: options.resource,
            scopeLogs: [
              {
                scope: options.scope,
                logRecords: [
                  {
                    timeUnixNano: now,
                    observedTimeUnixNano: now,
                    severityNumber: severityNumber(logOptions.logLevel),
                    severityText: logOptions.logLevel,
                    body: OtlpResource.unknownToAttributeValue(
                      message.length === 1 ? message[0] : message,
                    ),
                    attributes,
                    ...(currentSpan
                      ? {
                          traceId: currentSpan.traceId,
                          spanId: currentSpan.spanId,
                        }
                      : {}),
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });
