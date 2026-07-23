import { Effect } from 'effect';


export const load = (id: string) =>
    Effect.succeed(id);
