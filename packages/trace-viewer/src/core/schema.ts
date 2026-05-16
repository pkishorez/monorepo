import { Exit, Schema } from 'effect';
export type ExitStatus = 'success' | 'failure' | 'interrupted' | 'running';

export const getExitStatus = <E>(exit?: Exit.Exit<E>): ExitStatus => {
  if (!exit) return 'running';

  switch (exit._tag) {
    case 'Success':
      return 'success';
    case 'Failure':
      if (exit.cause._tag === 'Interrupt') {
        return 'interrupted';
      } else {
        return 'failure';
      }
  }
};

export const TimeInMillis = Schema.Number.pipe(
  Schema.brand('time/TimeInMillis'),
);

export const tracerSpanSchema = Schema.Struct({
  traceId: Schema.String,
  parentSpanId: Schema.NullOr(Schema.String),
  spanId: Schema.String,

  startTime: TimeInMillis,
  end: Schema.NullOr(
    Schema.Struct({
      time: TimeInMillis,
      exit: Schema.Unknown as Schema.Schema<Exit.Exit<any>>,
    }),
  ),

  name: Schema.String,
  attributes: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  events: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      time: TimeInMillis,
      attributes: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    }),
  ),
});
