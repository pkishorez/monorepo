import { Effect } from 'effect';


export const result = ((operation) => typeof operation === 'function' ? Effect.suspend(operation) : operation)(operation);
