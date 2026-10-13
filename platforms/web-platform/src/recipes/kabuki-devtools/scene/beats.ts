import type { Envelope, Source } from '@kestack/kabuki';

/*
 * The Beats of a Step: what its Message did, read from its Envelope and the
 * Commands its Update asked for, never from the Snapshot before it.
 *
 * 1. Send     where it was Sent from: the Node of the Instance that Sent it,
 *             and the Worker that did, if one did, by its row there. An
 *             Instance the Message stopped is found at its slot's Node.
 * 2. Request  an Instance asking another, up the tree, for a change.
 * 3. Command  every Command the Update asked for.
 */

/** A Step's Message, with what its Update asked for. */
export interface Said {
  readonly envelope: Envelope;
  readonly commands: ReadonlyArray<unknown>;
}

export interface Beats {
  /** New for each Message, so its Beats play again. */
  readonly key: string;
  readonly tag: string;
  readonly payload: object;
  readonly at: number;
  readonly source: Source;
  /** The Node the Message went to; none for a Message that was dropped. */
  readonly to: string | undefined;
  readonly send:
    | {
        readonly at: string;
        readonly by: string;
        /** The Worker that Sent it, by name: its row on the Node, there even once its key ended. */
        readonly worker?: string;
      }
    | undefined;
  readonly request: { readonly from: string; readonly to: string } | undefined;
  readonly commands: ReadonlyArray<{
    readonly name: string;
    readonly args: unknown;
  }>;
}

const byOf = (source: Source): string => {
  switch (source.kind) {
    case 'view':
      return 'View';
    case 'command':
      return source.name;
    case 'worker':
      return source.key === undefined
        ? source.name
        : `${source.name}#${source.key}`;
    case 'provide':
      return 'Provides';
    case 'outside':
      return 'Outside';
    case 'restore':
      return 'Restore';
  }
};

export const beatsOf = (
  { envelope, commands }: Said,
  /** The Node an Instance, or one of its Workers, is drawn at. */
  find: (id: string) => string | undefined,
): Beats => {
  const { destination, message, source, at } = envelope;
  const { _tag, ...payload } = message as { readonly _tag: string };
  const to = find(destination);
  const from = 'instance' in source ? find(source.instance) : undefined;
  const key =
    source.kind === 'worker' ? `~${source.name}#${source.key ?? ''}` : '';
  const worker =
    source.kind === 'worker' ? find(`${source.instance}${key}`) : undefined;

  // 1. Send
  const sentAt = worker ?? from ?? to;
  // 2. Request
  const request = from && to && from !== to ? { from, to } : undefined;
  // 3. Command
  const asked = commands.flatMap((command) =>
    command && typeof command === 'object' && 'name' in command
      ? [
          {
            name: String(command.name),
            args: (command as { args?: unknown }).args,
          },
        ]
      : [],
  );

  return {
    key: `${at}:${destination}:${_tag}`,
    tag: _tag,
    payload,
    at,
    source,
    to,
    send: sentAt
      ? {
          at: sentAt,
          by: byOf(source),
          ...(source.kind === 'worker' ? { worker: source.name } : {}),
        }
      : undefined,
    request,
    commands: asked,
  };
};
