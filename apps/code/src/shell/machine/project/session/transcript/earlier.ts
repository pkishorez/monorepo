import type { Message } from '@kestack/ai-toolkit/api';

/*
 * What a Fork carries on from: the history before its Fork Point, read
 * from the Sessions up its chain, never copied. `forkedFrom` names the
 * Session forked and the Turn. If that Session's own Messages hold the
 * Message of the Turn with a `turnEnded` part, the history is its own
 * history, then its own Messages up to that one, ordered by id; if not,
 * the Turn was one it inherited, so the same is read from its own
 * `forkedFrom.sessionId` instead, there only up to the Turn it was forked
 * after. That bound only tightens up the chain: a Session that inherited
 * the Turn it was forked after holds none of its own Messages below it.
 *
 * A Session's own Messages are believed to lack the Turn only once its
 * Window is Caught Up; until then the history is still being read.
 */

interface ForkedFrom {
  readonly sessionId: string;
  readonly turnId: string;
}

interface Ancestor {
  readonly id: string;
  readonly forkedFrom: ForkedFrom | null;
}

/** One Session's own Messages as its Window holds them. */
interface Window {
  readonly rows: ReadonlyArray<Message>;
  readonly caughtUp: boolean;
}

export type Earlier =
  | {
      readonly _tag: 'Read';
      readonly messages: ReadonlyArray<Message>;
      /** How many Turns it holds. */
      readonly turns: number;
    }
  /** A Window it needs is not Caught Up yet. */
  | { readonly _tag: 'Reading' }
  /** A Session up the chain is gone, or never held the Turn. */
  | { readonly _tag: 'Missing' };

const byId = (a: Message, b: Message) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** The index of the Message that ended `turnId`; -1 when none did. */
const endOf = (messages: ReadonlyArray<Message>, turnId: string) =>
  messages.findIndex(
    (message) =>
      message.turnId === turnId &&
      message.parts.some(({ type }) => type === 'turnEnded'),
  );

/**
 * The history before a Fork Point, from the Sessions up the chain, nearest
 * first, and the Window of each.
 */
export function earlierOf(
  forkedFrom: ForkedFrom,
  lineage: ReadonlyArray<Ancestor>,
  windows: ReadonlyMap<string, Window>,
): Earlier {
  const sessions = new Map(lineage.map((each) => [each.id, each]));
  // A chain longer than the lineage loops; it is never read past it.
  let steps = lineage.length + 1;

  // `within`: only its own Messages up to that Turn's end count; null for all.
  const upTo = (at: ForkedFrom, within: string | null): Earlier => {
    if (steps-- === 0) return { _tag: 'Missing' };
    const session = sessions.get(at.sessionId);
    const window = windows.get(at.sessionId);
    if (session === undefined) return { _tag: 'Missing' };
    const own = [...(window?.rows ?? [])].sort(byId);
    const bound = within === null ? own.length - 1 : endOf(own, within);
    const end = endOf(own.slice(0, bound + 1), at.turnId);
    if (end === -1) {
      if (window?.caughtUp !== true) return { _tag: 'Reading' };
      // Inherited: the Turn is the one it was forked after, or before it,
      // and a bound it inherited too stays.
      return session.forkedFrom === null
        ? { _tag: 'Missing' }
        : upTo(
            { sessionId: session.forkedFrom.sessionId, turnId: at.turnId },
            within !== null && bound === -1
              ? within
              : session.forkedFrom.turnId,
          );
    }
    const before: Earlier =
      session.forkedFrom === null
        ? { _tag: 'Read', messages: [], turns: 0 }
        : upTo(session.forkedFrom, null);
    if (before._tag !== 'Read') return before;
    const messages = [...before.messages, ...own.slice(0, end + 1)];
    return {
      _tag: 'Read',
      messages,
      turns: new Set(messages.map(({ turnId }) => turnId)).size,
    };
  };

  return upTo(forkedFrom, null);
}
