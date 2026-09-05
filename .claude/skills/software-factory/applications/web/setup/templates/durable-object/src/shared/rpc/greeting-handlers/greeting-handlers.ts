import { Effect } from 'effect';
import { Greeting } from '../greeting/index.ts';

export const GreetingHandlers = Greeting.toLayer({
  Hello: () => Effect.succeed('Hello from __APP_TITLE__!'),
});
