import type * as Socket from 'effect/socket/Socket';

/*
 * A WebSocket held in memory: two ends shaped as the browser's, one for the
 * page that dials, one for the server it reaches in the same tab. Frames
 * cross as the network carries them, in order and never at once, so both
 * sides run their real socket code: Effect RPC's protocol on each side, the
 * reconnects, and the closes a browser reads, with their codes.
 *
 * - A dialled end is CONNECTING until the tab `accept`s it, which gives the
 *   server its end, or `refuse`s it, as a browser fails a socket it could
 *   not open: an error, then a close with 1006.
 * - Frames sent before the other end listens are held until it does.
 * - `drop` closes both ends with 1006, as a tunnel that goes away does.
 */

type Type = 'open' | 'message' | 'error' | 'close';
type Listener = (event: Socket.WebSocketEvent) => void;

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** The close code of a socket that ended without a close frame. */
const ABNORMAL = 1006;

/** One end of a socket held in memory. */
export class End implements Socket.WebSocketLike {
  readyState: number = CONNECTING;
  /** The subprotocol the server selected; empty when none. */
  protocol = '';
  readonly #listeners = new Map<Type, Map<Listener, boolean>>();
  readonly #held: Array<unknown> = [];
  #other: End | undefined;

  addEventListener(
    type: Type,
    listener: Listener,
    options?: { readonly once?: boolean },
  ): void {
    const each = this.#listeners.get(type) ?? new Map<Listener, boolean>();
    each.set(listener, options?.once ?? false);
    this.#listeners.set(type, each);
    if (type === 'message' && this.#held.length > 0)
      queueMicrotask(() => this.#flush());
  }

  removeEventListener(type: Type, listener: Listener): void {
    this.#listeners.get(type)?.delete(listener);
  }

  send(data: string | Uint8Array<ArrayBuffer>): void {
    if (this.readyState === CONNECTING)
      throw new Error('InvalidStateError: the socket is still connecting');
    const other = this.#other;
    if (this.readyState !== OPEN || other === undefined) return;
    queueMicrotask(() => other.#receive(data));
  }

  close(code = 1000, reason = ''): void {
    this.#end(code, reason);
  }

  #emit(type: Type, event: Socket.WebSocketEvent) {
    const each = this.#listeners.get(type);
    if (each === undefined) return;
    // A listener added while this event is told waits for the next one.
    for (const [listener, once] of Array.from(each)) {
      if (once) each.delete(listener);
      listener(event);
    }
  }

  #listening() {
    return (this.#listeners.get('message')?.size ?? 0) > 0;
  }

  // Frames sent before a close still arrive, as the network delivers them.
  #receive(data: unknown) {
    if (this.readyState !== OPEN && this.readyState !== CLOSING) return;
    this.#held.push(data);
    this.#flush();
  }

  #flush() {
    while (this.#held.length > 0 && this.#listening())
      this.#emit('message', { type: 'message', data: this.#held.shift() });
  }

  /** Both ends close: each is told, after every frame already sent. */
  #end(code: number, reason: string) {
    if (this.readyState >= CLOSING) return;
    const ends = this.#other === undefined ? [this] : [this, this.#other];
    for (const end of ends) end.readyState = CLOSING;
    queueMicrotask(() => {
      for (const end of ends) {
        if (end.readyState === CLOSED) continue;
        end.readyState = CLOSED;
        end.#emit('close', { type: 'close', code, reason });
      }
    });
  }

  /** Opens this dialled end onto a new server end, selecting `protocol`. */
  static accept(dialled: End, protocol: string): End {
    const server = new End();
    server.readyState = OPEN;
    server.protocol = protocol;
    server.#other = dialled;
    dialled.#other = server;
    dialled.readyState = OPEN;
    dialled.protocol = protocol;
    queueMicrotask(() => dialled.#emit('open', { type: 'open' }));
    return server;
  }

  /** Fails this dialled end, as a browser fails a socket it could not open. */
  static refuse(dialled: End): void {
    if (dialled.readyState !== CONNECTING) return;
    dialled.readyState = CLOSED;
    queueMicrotask(() => {
      dialled.#emit('error', { type: 'error' });
      dialled.#emit('close', { type: 'close', code: ABNORMAL, reason: '' });
    });
  }

  /** Closes both ends with 1006, as a tunnel that goes away. */
  static drop(end: End): void {
    if (end.readyState === CONNECTING) return End.refuse(end);
    end.#end(ABNORMAL, '');
  }
}
