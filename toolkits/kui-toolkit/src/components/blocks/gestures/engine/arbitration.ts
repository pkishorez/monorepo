import type {
  Frame,
  GestureKind,
  Payload,
  Recognizer,
  RecognizerState,
  Verdict,
} from '../recognizers';

type Certain = Extract<Verdict, { type: 'track' | 'end' }>;

/** One recognizer's place in the engine: its reader for the current touch sequence and where it stands. */
export type Slot = {
  readonly recognizer: Recognizer;
  read: (frame: Frame) => Verdict;
  state: RecognizerState;
  /** The touch sequence this reader started in; a double tap spans two. */
  sequence: number;
  /** Certain, but not yet allowed to claim: waiting on a recognizer it requires to fail. */
  request?: Certain;
  deadline?: number;
  last?: Payload;
};

export type Emit = (
  slot: Slot,
  phase: 'began' | 'changed' | 'ended' | 'cancelled',
  event: Payload,
) => void;

export const createSlot = (recognizer: Recognizer, sequence: number): Slot => ({
  recognizer,
  read: recognizer.start(),
  state: 'possible',
  sequence,
});

export const isActive = (slot: Slot) =>
  slot.state === 'began' || slot.state === 'changed';

export const isTerminal = (slot: Slot) =>
  slot.state === 'ended' ||
  slot.state === 'cancelled' ||
  slot.state === 'failed';

export const fail = (slot: Slot) => {
  slot.state = 'failed';
  slot.request = undefined;
  slot.deadline = undefined;
};

/** Stops an active recognizer, or fails one still deciding. */
export const cancel = (slot: Slot, emit: Emit) => {
  if (isActive(slot)) {
    slot.state = 'cancelled';
    if (slot.last !== undefined) emit(slot, 'cancelled', slot.last);
  } else if (slot.state === 'possible') {
    fail(slot);
  }
};

/** Applies one recognizer's verdict on a frame. Claims are left to {@link resolveClaims}. */
export const applyVerdict = (slot: Slot, verdict: Verdict, emit: Emit) => {
  if (isActive(slot)) {
    if (verdict.type === 'track') {
      slot.state = 'changed';
      emit(slot, 'changed', verdict.event);
    } else if (verdict.type === 'end') {
      slot.state = 'ended';
      emit(slot, 'ended', verdict.event);
    } else if (verdict.type === 'fail') {
      cancel(slot, emit);
    }
    return;
  }
  if (verdict.type === 'fail') fail(slot);
  else if (verdict.type === 'wait') slot.deadline = verdict.deadline;
  else {
    slot.request = verdict;
    slot.deadline = undefined;
  }
};

const SUCCEEDED: ReadonlySet<RecognizerState> = new Set([
  'began',
  'changed',
  'ended',
  'cancelled',
]);

const standing = (
  slot: Slot,
  slots: ReadonlyArray<Slot>,
  claims: ReadonlyMap<number, GestureKind>,
) => {
  if (claims.has(slot.sequence)) return 'fail';
  let blocked = false;
  for (const kind of slot.recognizer.requiresFailureOf) {
    const dependency = slots.find((other) => other.recognizer.kind === kind);
    if (dependency === undefined) continue;
    if (SUCCEEDED.has(dependency.state)) return 'fail';
    if (dependency.state === 'possible') blocked = true;
  }
  return blocked ? 'wait' : 'claim';
};

/**
 * Lets certain recognizers claim, in slot order, until nothing changes: the
 * first to claim a touch sequence wins it and every other recognizer still
 * deciding in that sequence fails. A recognizer whose requirement is still
 * deciding keeps waiting; one whose requirement succeeded fails.
 */
export const resolveClaims = (
  slots: ReadonlyArray<Slot>,
  claims: Map<number, GestureKind>,
  emit: Emit,
): GestureKind | undefined => {
  let claimed: GestureKind | undefined;
  let changed = true;
  while (changed) {
    changed = false;
    for (const slot of slots) {
      const request = slot.request;
      if (slot.state !== 'possible' || request === undefined) continue;
      const verdict = standing(slot, slots, claims);
      if (verdict === 'wait') continue;
      changed = true;
      if (verdict === 'fail') {
        fail(slot);
        continue;
      }
      claims.set(slot.sequence, slot.recognizer.kind);
      claimed = slot.recognizer.kind;
      for (const other of slots) {
        if (
          other !== slot &&
          other.sequence === slot.sequence &&
          other.state === 'possible'
        ) {
          fail(other);
        }
      }
      slot.request = undefined;
      if (slot.recognizer.continuous) {
        slot.state = 'began';
        emit(slot, 'began', request.event);
      }
      if (request.type === 'end') {
        slot.state = 'ended';
        emit(slot, 'ended', request.event);
      }
    }
  }
  return claimed;
};
