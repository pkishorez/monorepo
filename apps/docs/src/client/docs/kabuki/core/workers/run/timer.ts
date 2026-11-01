import { Console, Effect } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { TimerLive } from '../components/timer.ts';

// Start the timer, let its Worker tick, then pause it.
export const program = Effect.gen(function* () {
  const app = yield* Runtime.start(TimerLive);
  const timer = app.instance({ from: 'docs' });
  const workers = () => timer.workers.map((worker) => worker.name);
  yield* Console.log(timer._tag, 'workers:', workers());

  // Entering Running starts the tick Worker written in it.
  timer.send({ _tag: 'Started' });
  yield* Console.log(timer._tag, 'workers:', workers());

  // Wait for each tick the Worker sends.
  for (const seconds of [1, 2, 3]) {
    yield* timer.until((now) => now.model.seconds === seconds);
    yield* Console.log('Ticked', timer.model);
  }

  // Leaving Running stops the Worker. Nothing ticks after this.
  // Sent while the last tick is still being handled, it waits its turn.
  timer.send({ _tag: 'Paused' });
  yield* timer.until((now) => now._tag === 'Stopped');
  yield* Console.log(timer._tag, 'workers:', workers());
  yield* Effect.sleep('1.5 seconds');
  return timer.model;
});
