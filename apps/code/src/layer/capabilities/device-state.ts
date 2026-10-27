import { Context, Effect, Schema, Stream } from 'effect';
import type { DatabaseError } from '@kestack/std-toolkit/db';
import type { Gone } from './gone.ts';

/*
 * Device State: what this browser keeps for itself and no other device
 * sees: the user's own Bindings, whether Vim Mode is on, whether the app
 * floats as a window, the
 * microphone a Dictation records from, whether the Touch Draft takes
 * Smart Input and Smart Displacement, the Machine the sidebar shows and its width, and the Unseen marks
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
 * Device State as read: Bindings by Action id; whether Vim Mode is on;
 * whether the app floats as a window on a wide screen; the text size; the
 * microphone chosen, by the browser's `deviceId`, null for the system
 * default; whether the Touch Draft takes Smart Input: a tap opens it,
 * and another places the caret, typing only from Edit; whether it takes
 * Smart Displacement: a caret or an end dragged sits above the finger; the Machine the sidebar shows,
 * null for every Machine; the sidebar's width on a wide screen, in px; Unseen marks by Machine id and then Session id.
 */
/** How big text and spacing are, with a keyboard on a wide screen. */
export const TextSize = Schema.Literals(['small', 'medium', 'large']);
export type TextSize = typeof TextSize.Type;

export const Device = Schema.Struct({
  bindings: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  vim: Schema.Boolean,
  floating: Schema.Boolean,
  textSize: TextSize,
  microphone: Schema.NullOr(Schema.String),
  smartInput: Schema.Boolean,
  smartDisplacement: Schema.Boolean,
  sidebarMachine: Schema.NullOr(Schema.String),
  sidebarWidth: Schema.Finite,
  unseen: Schema.Record(Schema.String, Marks),
});
export type Device = typeof Device.Type;

/** What a browser that keeps nothing reads: the default keys, Vim Mode off, no window, medium text, the default microphone, no Smart Input nor Displacement, every Machine in a sidebar 260 px wide, no marks. */
export const nothing: Device = {
  bindings: {},
  vim: false,
  floating: false,
  textSize: 'medium',
  microphone: null,
  smartInput: false,
  smartDisplacement: false,
  sidebarMachine: null,
  sidebarWidth: 260,
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
    readonly setFloating: (on: boolean) => Effect.Effect<void, DatabaseError>;
    readonly setTextSize: (
      size: TextSize,
    ) => Effect.Effect<void, DatabaseError>;
    readonly setMicrophone: (
      deviceId: string | null,
    ) => Effect.Effect<void, DatabaseError>;
    readonly setSmartInput: (on: boolean) => Effect.Effect<void, DatabaseError>;
    readonly setSmartDisplacement: (
      on: boolean,
    ) => Effect.Effect<void, DatabaseError>;
    readonly setSidebarMachine: (
      machineId: string | null,
    ) => Effect.Effect<void, DatabaseError>;
    readonly setSidebarWidth: (
      width: number,
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
