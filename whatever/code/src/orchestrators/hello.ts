import { Effect } from 'effect';
import { hello } from '../domain/index.js';

export const greet = (name: string) => Effect.succeed(hello(name));
