import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

/**
 * FROZEN. The one message a page sends a worker outside Worker RPC: it goes
 * to the waiting worker, a newer build than the page, so every worker
 * version ever shipped must understand these shapes. Never change or remove
 * a field; add a new `type` instead. A worker ignores a `type` it does not
 * know and sends no reply, so senders must time out.
 */
export const COMMAND_KEY = '__pwaToolkit';
const Envelope = { [COMMAND_KEY]: Schema.Literal(1) } as const;

/** Client → worker, via `worker.postMessage(command, [port])`. */
export const Command = Schema.Struct({
  ...Envelope,
  type: Schema.Literal('SKIP_WAITING'),
});
export type Command = typeof Command.Type;
export type CommandType = Command['type'];

/** Worker → client, posted once on the command's transferred `MessagePort`. */
export const CommandReply = Schema.Union([
  Schema.Struct({ ...Envelope, type: Schema.Literal('DONE') }),
  Schema.Struct({
    ...Envelope,
    type: Schema.Literal('FAILED'),
    message: Schema.String,
  }),
]);
export type CommandReply = typeof CommandReply.Type;

export const makeCommand = (type: CommandType): Command => ({
  [COMMAND_KEY]: 1,
  type,
});

export const commandReply = {
  done: (): CommandReply => ({ [COMMAND_KEY]: 1, type: 'DONE' }),
  failed: (message: string): CommandReply => ({
    [COMMAND_KEY]: 1,
    type: 'FAILED',
    message,
  }),
};

/** Whether `data` carries the command key at all (another listener's message if not). */
export const isCommandEnvelope = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && COMMAND_KEY in data;

const decodeCommand = Schema.decodeUnknownOption(Command);
const decodeReply = Schema.decodeUnknownOption(CommandReply);

export const matchCommand = (data: unknown): Option.Option<Command> =>
  isCommandEnvelope(data) ? decodeCommand(data) : Option.none();

export const matchCommandReply = (
  data: unknown,
): Option.Option<CommandReply> =>
  isCommandEnvelope(data) ? decodeReply(data) : Option.none();
