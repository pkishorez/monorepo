import { Effect } from 'effect';

export const greet = (name: string) => Effect.succeed(`Hello, ${name}!`);
