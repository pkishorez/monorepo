import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { RUN } from '../../actor/index.ts';
import type { Command } from '../../actor/index.ts';
import type { Own } from './host.ts';
import type { CommandStatus } from './work.ts';

/*
 * Commands: errands an Update asked for. Each runs once, in its Instance's
 * Scope, and Sends the Message it ends with. Nothing stops one but its
 * Instance stopping. Each is held in `running` from the moment it is
 * forked, before it starts, until it ends.
 */

const isMessage = Schema.is(Schema.Struct({ _tag: Schema.String }));

export const runCommands = (
  commands: ReadonlyArray<unknown>,
  own: Own,
  scope: Scope.Scope,
  running: Set<CommandStatus>,
) => {
  for (const { name, args, [RUN]: run } of commands as ReadonlyArray<
    Command<unknown>
  >) {
    const status: CommandStatus = { name, args, since: own.now() };
    running.add(status);
    const fiber = own.fork(
      scope,
      `command ${name}`,
      { kind: 'command', instance: own.address, name },
      Effect.flatMap(run, (result) =>
        isMessage(result) ? own.self.send(result) : Effect.void,
      ),
    );
    fiber.addObserver(() => void running.delete(status));
  }
};
