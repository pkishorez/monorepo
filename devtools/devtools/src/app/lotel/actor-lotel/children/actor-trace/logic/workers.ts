import { Effect, Stream } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';
import { Telemetry } from '../../../../services/telemetry/contract/index.js';
import type { Live } from '../../../../services/telemetry/contract/index.js';
import type { TraceShape } from './shared/index.js';

// 1. Watch
/** The same Spans as before, each the very same, so nothing new is Sent. */
const sameLive = (left: Live, right: Live) =>
  left.ready === right.ready &&
  left.spans.length === right.spans.length &&
  left.spans.every((span, at) => span === right.spans[at]);

export const workers: WorkersOf<typeof TraceShape> = {
  watch: {
    run: (self) =>
      Effect.gen(function* () {
        const telemetry = yield* Telemetry;
        const { model } = yield* self.get;
        yield* telemetry.live.pipe(
          Stream.map(({ ready, spans }) => ({
            ready,
            spans: spans.filter((span) => span.traceId === model.traceId),
          })),
          Stream.changesWith(sameLive),
          Stream.runForEach(({ ready, spans }) =>
            self.send({ _tag: 'Received', spans, ready }),
          ),
        );
      }),
  },
};
