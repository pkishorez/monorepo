import { Context, Effect, Schema, Stream } from 'effect';
import type { DatabaseError } from '@kestack/std-toolkit/db';
import type { Gone } from './gone.ts';

/*
 * Device State: what this browser keeps for itself and no other device
 * sees: the user's own Bindings and whether Vim Mode is on, the
 * microphone a Dictation records from, whether the Touch Draft is written
 * by text or by voice, the Machine the sidebar shows, and the Unseen marks
 * of each Machine. The store is the truth; an actor
 * that shows it reads it again after every write, from this tab or
 * another. The app Layer gives it, from `services/device-state/`.
 *
 * An Unseen mark is a Machine's Session with the end time of the last
 * Turn seen on this device. A Session is Unseen when its last Turn ended
 * after that; one never opened here has no mark, and is never Unseen. A
 * mark goes with its Machine, and with the Account the Machine is of.
 */

/** One Machine's Unseen marks, by Session id. */
export const Marks = Schema.Record(Schema.String, Schema.Finite);
export type Marks = typeof Marks.Type;

/**
 * Device State as read: Bindings by Action id; whether Vim Mode is on; the
 * microphone chosen, by the browser's `deviceId`, null for the system
 * default; how the Touch Draft is written; the Machine the sidebar shows,
 * null for every Machine; Unseen marks by Machine id and then Session id.
 */
export const Device = Schema.Struct({
  bindings: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  vim: Schema.Boolean,
  microphone: Schema.NullOr(Schema.String),
  touchMode: Schema.Literals(['text', 'voice']),
  sidebarMachine: Schema.NullOr(Schema.String),
  unseen: Schema.Record(Schema.String, Marks),
});
export type Device = typeof Device.Type;

/** What a browser that keeps nothing reads: the default keys, Vim Mode off, the default microphone, voice, every Machine, no marks. */
export const nothing: Device = {
  bindings: {},
  vim: false,
  microphone: null,
  touchMode: 'voice',
  sidebarMachine: null,
  unseen: {},
};

/** The Capability that reads and writes Device State, and says when it changed. */
export class DeviceState extends Context.Service<
  DeviceState,
  {
    readonly read: Effect.Effect<Device, DatabaseError>;
    readonly setBindings: (
      bindings: Device['bindings'],
    ) => Effect.Effect<void, DatabaseError>;
    readonly setVim: (on: boolean) => Effect.Effect<void, DatabaseError>;
    readonly setMicrophone: (
      deviceId: string | null,
    ) => Effect.Effect<void, DatabaseError>;
    readonly setTouchMode: (
      mode: Device['touchMode'],
    ) => Effect.Effect<void, DatabaseError>;
    readonly setSidebarMachine: (
      machineId: string | null,
    ) => Effect.Effect<void, DatabaseError>;
    /** Marks the Session seen, for the Account its Machine is of. */
    readonly markSeen: (
      accountId: string,
      machineId: string,
      projectId: string,
      sessionId: string,
      seen: number,
    ) => Effect.Effect<void, DatabaseError>;
    /** Deletes the Unseen marks of what went, best effort. */
    readonly drop: (gone: Gone) => Effect.Effect<void>;
    /** Once per write, here or in another tab; rings while busy fold into one. */
    readonly changes: Stream.Stream<void>;
  }
>()('code/DeviceState') {
  static readonly Device = Device;
  /** Reads Device State; a browser that cannot keep it reads as keeping nothing. */
  static readonly read = Effect.flatMap(DeviceState, (store) =>
    store.read.pipe(Effect.orElseSucceed(() => nothing)),
  );
  /** Once per write, here or in another tab. */
  static readonly changes = Stream.unwrap(
    Effect.map(DeviceState, (store) => store.changes),
  );
}
