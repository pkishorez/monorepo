import { Effect } from 'effect';
import { decision, exhaustive, when } from 'laymos/story';

export const result = decision(
  'Literal keys',
  { description: 'Supports every Decision key type.' },
  value,
).pipe(
  when(true, { description: 'Boolean.' }, () => Effect.succeed('boolean')),
  when(-1, { description: 'Number.' }, () => Effect.succeed('number')),
  when('text', { description: 'String.' }, () => Effect.succeed('string')),
  exhaustive,
);
