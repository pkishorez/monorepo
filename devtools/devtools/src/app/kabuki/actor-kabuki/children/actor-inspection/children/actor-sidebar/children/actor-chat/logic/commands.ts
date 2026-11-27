import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Agent } from '../../../../../../../../../services/agent/contract/index.js';
import { THREAD_KIND } from './shared/index.js';

const systemOf = (name: string, app: string) =>
  [
    `You are the Chat beside DevTools' Kabuki Inspector. The person is looking at the Kabuki Session "${name}", a running ${app} app, whose code is in the folder you are in.`,
    `DevTools' MCP tools reach it: pass session "${name}" to every kabuki_* tool. Look with kabuki_look, kabuki_timeline, kabuki_step and kabuki_fakes. Change it only when asked: kabuki_send Sends a Message, kabuki_control runs a Fake's control, kabuki_travel and kabuki_fork move its History. lotel_* read its traces and logs. Read the code when it helps.`,
    'Answer briefly, in plain words.',
  ].join('\n\n');

const refused = ({ message: problem }: { readonly message: string }) =>
  Effect.succeed({ _tag: 'Refused' as const, problem });

export const ask = Command.make('ask', {
  args: Schema.Struct({
    name: Schema.String,
    app: Schema.String,
    folder: Schema.String,
    prompt: Schema.String,
  }),
  run: ({ name, app, folder, prompt }) =>
    Effect.flatMap(Agent, (agent) =>
      agent.ask({
        folder,
        kind: THREAD_KIND,
        prompt,
        system: systemOf(name, app),
        mcp: true,
      }),
    ).pipe(
      Effect.map((thread) => ({ _tag: 'Started' as const, thread })),
      Effect.catch(refused),
    ),
});

export const followUp = Command.make('followUp', {
  args: Schema.Struct({ thread: Schema.String, prompt: Schema.String }),
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
