import type * as Effect from 'effect/Effect';
import type * as Option from 'effect/Option';
import type { HibernatingSocket } from '../durable-object-state.ts';

/** A streaming call exactly as the client sent it, headers included, still encoded. */
export interface StreamRequest {
  readonly _tag: 'Request';
  readonly id: string | number;
  readonly tag: string;
  readonly payload: unknown;
  readonly headers: ReadonlyArray<readonly [string, string]>;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly sampled?: boolean;
}

/** A stream that was running when the object hibernated, and how far it got. */
export interface SavedStream {
  readonly request: StreamRequest;
  /** The encoded checkpoint, or `None` when the handler never wrote one. */
  readonly checkpoint: Option.Option<unknown>;
}

/** What a socket needs to resume: its id, its connection value and its streams. */
export interface SavedSocket {
  readonly clientId: number;
  /** The encoded connection value; `undefined` when the server has no connection slot. */
  readonly connection: unknown;
  readonly streams: ReadonlyArray<SavedStream>;
}

/**
 * Where the websocket server keeps what must survive hibernation: each
 * socket's record and each open stream's request and checkpoint.
 *
 * Every method gets the socket and its client id, so an adapter can keep its
 * data on the socket (the attachment) or anywhere keyed by the id.
 */
export interface StreamStore {
  /** Writes a just-accepted socket's record. Runs before any of its messages. */
  readonly connect: (
    socket: HibernatingSocket,
    clientId: number,
    connection: unknown,
  ) => Effect.Effect<void>;
  /** On wake: the socket's record and streams, or `None` when its record is missing. */
  readonly load: (
    socket: HibernatingSocket,
  ) => Effect.Effect<Option.Option<SavedSocket>>;
  /** A stream started. Keeps the existing entry (and its checkpoint) if there is one. */
  readonly start: (
    socket: HibernatingSocket,
    clientId: number,
    request: StreamRequest,
  ) => Effect.Effect<void>;
  readonly getCheckpoint: (
    socket: HibernatingSocket,
    clientId: number,
    requestId: string | number,
  ) => Effect.Effect<Option.Option<unknown>>;
  /** Saves an encoded checkpoint. Does nothing once the stream has ended. */
  readonly putCheckpoint: (
    socket: HibernatingSocket,
    clientId: number,
    requestId: string | number,
    checkpoint: unknown,
  ) => Effect.Effect<void>;
  /** A stream ended (exit, interrupt, or its checkpoint was cleared): forget it. */
  readonly end: (
    socket: HibernatingSocket,
    clientId: number,
    requestId: string | number,
  ) => Effect.Effect<void>;
  /** The socket closed: forget its record and every stream on it. */
  readonly forget: (
    socket: HibernatingSocket,
    clientId: number,
  ) => Effect.Effect<void>;
  /** On every boot: forget every socket whose id is not in `live`. */
  readonly reconcile: (live: ReadonlySet<number>) => Effect.Effect<void>;
}
