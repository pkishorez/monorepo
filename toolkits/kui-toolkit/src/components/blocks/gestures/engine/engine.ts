import type {
  Frame,
  GestureEvent,
  GestureKind,
  Recognizer,
  RecognizerState,
  Track,
} from '../recognizers';
import {
  applyVerdict,
  cancel,
  createSlot,
  type Emit,
  fail,
  isTerminal,
  resolveClaims,
  type Slot,
} from './arbitration';
import { createPointerTracker } from './pointers';

/** One pointer event, from any input source: `t` in ms on one clock. */
export type PointerInput = {
  readonly id: number;
  readonly type: 'down' | 'move' | 'up' | 'cancel';
  readonly x: number;
  readonly y: number;
  readonly t: number;
};

/** Everything the debug overlay shows: pointers, every recognizer's state, and who claimed. */
export type Inspection = {
  readonly pointers: ReadonlyArray<Track>;
  readonly states: ReadonlyArray<{
    readonly kind: GestureKind;
    readonly state: RecognizerState;
  }>;
  readonly claimed: GestureKind | undefined;
  /** A third finger or a pointercancel: the rest of this touch sequence is ignored. */
  readonly ignoring: boolean;
};

const MAX_POINTERS = 2;

/**
 * Recognizes gestures from raw pointer input, touching no DOM. A touch
 * sequence runs from the first pointer down until every pointer is up; every
 * recognizer reads each input, and the first to become certain claims the
 * sequence while the rest fail. A third pointer or a pointercancel (the
 * browser took the touch, e.g. for a scroll) cancels everything until the
 * pointers lift. Time only moves with inputs and {@link tick}: schedule a tick
 * for {@link nextDeadline} so holds and double-tap timeouts resolve.
 */
export const createGestureEngine = (options: {
  readonly recognizers: ReadonlyArray<Recognizer>;
  /** Travel of a full horizontal swipe; read once per touch sequence. */
  readonly width: () => number;
  readonly onGesture: (event: GestureEvent) => void;
}) => {
  const pointers = createPointerTracker();
  const listeners = new Set<() => void>();
  const claims = new Map<number, GestureKind>();
  const slots: Array<Slot> = options.recognizers.map((r) => createSlot(r, 0));
  let sequence = 0;
  let width = 0;
  let ignoring = false;
  let claimed: GestureKind | undefined;

  const emit: Emit = (slot, phase, event) => {
    slot.last = event;
    options.onGesture({ ...event, phase } as GestureEvent);
  };

  // A tap waiting out a double tap, or a double tap between its taps, carries
  // into the next sequence; every other recognizer starts over.
  const beginSequence = () => {
    sequence += 1;
    ignoring = false;
    claimed = undefined;
    width = options.width();
    for (const [index, slot] of slots.entries()) {
      const carried =
        slot.state === 'possible' &&
        (slot.request !== undefined || slot.deadline !== undefined);
      if (!carried) slots[index] = createSlot(slot.recognizer, sequence);
    }
    const live = new Set(slots.map((slot) => slot.sequence));
    for (const key of claims.keys()) if (!live.has(key)) claims.delete(key);
  };

  const ignoreRest = () => {
    ignoring = true;
    for (const slot of slots) cancel(slot, emit);
  };

  const step = (frame: Frame) => {
    if (ignoring) return;
    for (const slot of slots) {
      if (!isTerminal(slot)) applyVerdict(slot, slot.read(frame), emit);
    }
    // Nothing is down, so nothing without a deadline can still happen.
    if (frame.pointers.length === 0) {
      for (const slot of slots) {
        if (
          slot.state === 'possible' &&
          slot.request === undefined &&
          slot.deadline === undefined
        ) {
          fail(slot);
        }
      }
    }
    claimed = resolveClaims(slots, claims, emit) ?? claimed;
    if (frame.input?.type === 'down' && frame.pointers.length === 1) {
      restartSettled(frame);
    }
  };

  // A carried recognizer that settled on this sequence's first down (a double
  // tap whose second tap landed too far away) starts over on it, so the new
  // press is read in full.
  const restartSettled = (frame: Frame) => {
    let restarted = false;
    for (const [index, slot] of slots.entries()) {
      if (slot.sequence === sequence || !isTerminal(slot)) continue;
      const fresh = createSlot(slot.recognizer, sequence);
      slots[index] = fresh;
      applyVerdict(fresh, fresh.read(frame), emit);
      restarted = true;
    }
    if (restarted) claimed = resolveClaims(slots, claims, emit) ?? claimed;
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const feed = (input: PointerInput) => {
    if (input.type === 'down') {
      if (pointers.has(input.id)) return;
      if (pointers.size() === 0) beginSequence();
      const track = pointers.down(input);
      if (pointers.size() > MAX_POINTERS) ignoreRest();
      else {
        step({
          t: input.t,
          input: { type: 'down', track },
          pointers: pointers.list(),
          width,
        });
      }
    } else {
      if (!pointers.has(input.id)) return;
      if (input.type === 'cancel') {
        pointers.up(input);
        ignoreRest();
      } else {
        const track =
          input.type === 'move' ? pointers.move(input) : pointers.up(input);
        if (track === undefined) return;
        step({
          t: input.t,
          input: { type: input.type, track },
          pointers: pointers.list(),
          width,
        });
      }
    }
    notify();
  };

  return {
    feed,
    /** Advances time to `t` with no input, resolving holds and timeouts. */
    tick: (t: number) => {
      step({ t, pointers: pointers.list(), width });
      notify();
    },
    /** When the next {@link tick} is due, if anything is waiting on time. */
    nextDeadline: (): number | undefined => {
      if (ignoring) return undefined;
      let next: number | undefined;
      for (const slot of slots) {
        if (slot.state !== 'possible' || slot.deadline === undefined) continue;
        next =
          next === undefined ? slot.deadline : Math.min(next, slot.deadline);
      }
      return next;
    },
    /** Cancels whatever is under way, as if the platform had taken every pointer. */
    cancelAll: () => {
      if (pointers.size() === 0) return;
      pointers.clear();
      ignoreRest();
      notify();
    },
    inspect: (): Inspection => ({
      pointers: pointers.list(),
      states: slots.map((slot) => ({
        kind: slot.recognizer.kind,
        state: slot.state,
      })),
      claimed,
      ignoring,
    }),
    /** Called after every input and tick. */
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export type GestureEngine = ReturnType<typeof createGestureEngine>;
