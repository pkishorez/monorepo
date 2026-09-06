import { Effect } from 'effect';
import { Greeting } from '../../../shared/rpc/greeting/index.ts';

export const GreetingHandlers = Greeting.toLayer({
  Hello: () => Effect.succeed('Hello from Alchemy Console!'),
});
