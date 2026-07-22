import { Effect } from 'effect';


export const result = ((value: number) => Effect.succeed(value * 2))(2);
