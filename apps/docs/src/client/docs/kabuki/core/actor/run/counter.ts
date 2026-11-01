import { Console, Effect } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { CounterLive } from '../components/counter.ts';

// Run the Counter with no screen at all, and talk to it from outside.
export const program = Effect.gen(function* () {
  const app = yield* Runtime.start(CounterLive);
  const counter = app.instance({ from: 'docs' });
  yield* Console.log('starts at', counter.model);

  // Each send hands over one Message, and says what became of it.
  const sent = counter.send({ _tag: 'Added', amount: 5 });
  yield* Console.log('Added 5:', sent, counter.model);

  counter.send({ _tag: 'Added', amount: 10 });
  yield* Console.log('Added 10:', counter.model);

  // A Message that does not fit its Schema is refused at the door.
  const refused = counter.send({ _tag: 'Added', amount: 'ten' as never });
  yield* Console.log('Added "ten":', refused, counter.model);

  counter.send({ _tag: 'Reset' });
  return counter.model;
});
