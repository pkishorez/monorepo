import { Effect, FiberMap } from 'effect';

export class JobScheduler extends Effect.Service<JobScheduler>()(
  '@std-toolkit/cf-job-scheduler',
  {
    scoped: Effect.gen(function* () {
      const fiberMap = yield* FiberMap.make();

      return {
        subscribe: (id: string, effect: Effect.Effect<void>) =>
          FiberMap.run(fiberMap, id, effect, { onlyIfMissing: true }),
        unsubscribe: (id: string) => FiberMap.remove(fiberMap, id),
      };
    }),
  },
) {}
