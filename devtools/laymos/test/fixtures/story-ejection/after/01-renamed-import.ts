import { Effect } from 'effect';


export const load = (id: string) =>
    Effect.suspend(() => Effect.succeed(id));
