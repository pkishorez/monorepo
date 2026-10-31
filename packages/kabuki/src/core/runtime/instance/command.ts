import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { RUN } from '../../command/run/index.ts';
import type { Command } from '../../command/index.ts';
import type { Own } from './self.ts';

/*
 * Commands: errands an Update asked for. Each runs once, in its Instance's
 * Scope, and Sends the Message it ends with. Nothing stops one but its
 * Instance stopping.
 */

const isMessage = Schema.is(Schema.Struct({ _tag: Schema.String }));

export const runCommands = (
  commands: ReadonlyArray<unknown>,
  own: Own,
  scope: Scope.Scope,
) => {
  for (const { name, [RUN]: run } of commands as ReadonlyArray<
    Command<unknown>
  >)
    own.fork(
      scope,
      `command ${name}`,
      { kind: 'command', instance: own.self.id, name },
      Effect.flatMap(run, (result) =>
        isMessage(result) ? own.self.send(result) : Effect.void,
      ),
    );
};
