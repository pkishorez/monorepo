import { Tracer } from 'effect';

/** A Tracer that keeps every span it starts, for asserting on in tests. */
export const recordSpans = () => {
  const spans: Array<Tracer.NativeSpan> = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  return { spans, tracer };
};
