import { Effect } from 'effect';
import { hello } from '../domain/hello/index.js';

export const greet = (name: string) => Effect.succeed(hello(name));
