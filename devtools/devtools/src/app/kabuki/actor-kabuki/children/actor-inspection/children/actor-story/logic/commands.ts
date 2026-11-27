import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Agent } from '../../../../../../../services/agent/contract/index.js';
import { THREAD_KIND } from './shared/index.js';

const refused = ({ message: problem }: { readonly message: string }) =>
  Effect.succeed({ _tag: 'Refused' as const, problem });

export const ask = Command.make('ask', {
  args: Schema.Struct({
    folder: Schema.String,
    prompt: Schema.String,
    system: Schema.String,
    schema: Schema.JsonObject,
  }),
  run: (question) =>
    Effect.flatMap(Agent, (agent) =>
      agent.ask({ ...question, kind: THREAD_KIND }),
    ).pipe(
      Effect.map((thread) => ({ _tag: 'Started' as const, thread })),
      Effect.catch(refused),
    ),
});

export const followUp = Command.make('followUp', {
  args: Schema.Struct({
    thread: Schema.String,
    prompt: Schema.String,
    schema: Schema.JsonObject,
  }),
  run: (asked) =>
    Effect.flatMap(Agent, (agent) => agent.followUp(asked)).pipe(
      Effect.catch(refused),
    ),
});

export const cancel = Command.make('cancel', {
  args: Schema.Struct({ thread: Schema.String }),
  run: ({ thread }) =>
    Effect.flatMap(Agent, (agent) => agent.cancel(thread)).pipe(
      Effect.catch(refused),
    ),
});

export const clear = Command.make('clear', {
  args: Schema.Struct({ folder: Schema.String }),
  run: ({ folder }) =>
    Effect.flatMap(Agent, (agent) => agent.clear(folder, THREAD_KIND)).pipe(
      Effect.as({ _tag: 'Cleared' as const }),
      Effect.catch(({ message: problem }) =>
        Effect.succeed({ _tag: 'ClearRefused' as const, problem }),
      ),
    ),
});
