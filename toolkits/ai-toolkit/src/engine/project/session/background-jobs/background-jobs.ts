import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { BackgroundJobSchema } from '../../../../harness-wire/index.js';
import { SessionAgent } from '../agent/index.js';

/*
 * A Session's Background Jobs, as its agent last listed them. They live
 * here, in memory only: none while the agent is closed, and none after a
 * restart, since the processes behind them die with their agent.
 */

const Model = Schema.Struct({ jobs: Schema.Array(BackgroundJobSchema) });

const Message = Schema.TaggedUnion({
  Jobs: { jobs: Schema.Array(BackgroundJobSchema) },
});

export const BackgroundJobs = Actor.build(
  Actor.define('BackgroundJobs', {
    requires: [SessionAgent],
    model: Model,
    message: Message,
  }),
  {
    init: () => ({ model: { jobs: [] } }),
    on: { Jobs: ({ jobs }) => ({ model: { jobs } }) },
    workers: {
      follow: {
        run: (self) =>
          Effect.flatMap(SessionAgent, (context) =>
            Stream.runForEach(context.jobs, (jobs) =>
              self.send({ _tag: 'Jobs', jobs }),
            ),
          ),
      },
    },
  },
);
