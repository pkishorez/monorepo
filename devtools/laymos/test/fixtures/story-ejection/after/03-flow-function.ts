import { Effect } from 'effect';


export const double = (value: number) => Effect.succeed(value * 2);
