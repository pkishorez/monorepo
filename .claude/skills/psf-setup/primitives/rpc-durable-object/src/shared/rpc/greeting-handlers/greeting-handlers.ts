import { Effect } from 'effect';
import { greet } from '../../domain/greeting/index.ts';
import { Greeting } from '../greeting/index.ts';

export const GreetingHandlers = Greeting.toLayer({
  Hello: () => Effect.succeed(greet('__APP_TITLE__')),
});
