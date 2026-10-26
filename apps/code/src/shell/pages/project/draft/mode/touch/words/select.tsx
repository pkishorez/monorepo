import type { EditorView } from '@codemirror/view';
import { useGesture, type Pointer } from '@kestack/web-platform/ui/input';
import { useEffect, useRef, type RefObject } from 'react';

/*
 * Moving the caret and selecting in the words while they are read only,
 * no keyboard raised, so the next Dictation goes there or replaces what
 * is selected (`Selecting`).
 *
 * 1. Drag   a finger landing on the caret drags it, at once, or on
 *           either end of a selection drags that end, the other kept:
 *           the Gesture is the words' from its first movement.
 * 2. Hold   pressed and held still elsewhere, the word under the finger
 *           is selected, and a drag from there moves the selection's
 *           free end; once held, the Gesture is the words'. Moved before
 *           that, it is a scroll as any other.
 *
 * With `displace`, Smart Displacement, what is dragged sits above the
 * finger, not under it, so the words it is on stay in sight: it rises
 * there over the drag's first few px, from where it was taken, so it
 * never jumps. Editing, the keyboard up, the same: a finger landing on
 * the caret or an end is kept from iOS and drags it so; any other touch
 * is iOS's own (`useEditDrag`). Without it, editing is iOS's alone.
 */

type Point = { readonly x: number; readonly y: number };

/** How long a finger rests before it selects, in ms. */
const HOLD = 400;
/** How far it may wander while resting, in px. */
const STILL = 10;
/** How near the caret, or an end, a finger lands to take it, in px across. */
const NEAR = 28;
/** How far above the finger a dragged end sits, displaced, in px. */
const LIFT = 45;
/** Over how many px of the drag it rises there. */
const RISE = 24;

/** The word at `pos`, or the spot itself where there is none. */
export const wordAround = (view: EditorView, pos: number) => {
  const word = view.state.wordAt(pos);
  return word === null ? { from: pos, to: pos } : word;
};

/**
 * Where the end at `pos` is, its middle, if a finger landing at `at`
 * takes it; on the side of a wrap it is drawn on (`caret.ts`).
 */
const endAt = (
  editor: EditorView,
  at: Point,
  pos: number,
  side: -1 | 1,
): Point | null => {
  const end = editor.coordsAtPos(pos, side);
  if (end === null) return null;
  return Math.abs(at.x - end.left) <= NEAR / 2 &&
    at.y >= end.top - NEAR / 2 &&
    at.y <= end.bottom + NEAR / 2
    ? { x: end.left, y: (end.top + end.bottom) / 2 }
    : null;
};

/**
 * Which end of the main selection a finger landing at `at` takes, where
 * it is, and the end kept: null for a cursor, which moves whole.
 */
const takenAt = (editor: EditorView, at: Point) => {
  const { anchor, head } = editor.state.selection.main;
  const forward = head > anchor;
  const onHead = endAt(editor, at, head, forward ? -1 : 1);
  if (onHead !== null)
    return { taken: onHead, kept: anchor === head ? null : anchor };
  const onAnchor =
    anchor !== head ? endAt(editor, at, anchor, forward ? 1 : -1) : null;
  return onAnchor === null ? null : { taken: onAnchor, kept: head };
};

/**
 * Where a dragged end is aimed, the finger landed at `start` and now at
 * `now`, the end at `taken` as it was taken: under the finger, or,
 * displaced, from where it was to `LIFT` above, over the first `RISE` px.
 */
const aim = (start: Point, now: Point, taken: Point, displace: boolean) => {
  if (!displace) return now;
  const dx = taken.x - start.x;
  const dy = taken.y - start.y;
  const to = Math.min(dy, -LIFT);
  const risen = Math.min(
    1,
    Math.hypot(now.x - start.x, now.y - start.y) / RISE,
  );
  return { x: now.x + dx, y: now.y + dy + (to - dy) * risen };
};

export function Selecting({
  view,
  enabled,
  displace,
  onSelected,
}: {
  readonly view: RefObject<EditorView | null>;
  readonly enabled: boolean;
  /** Smart Displacement: what is dragged sits above the finger. */
  readonly displace: boolean;
  /** It selected, and the tap that ends the press is no tap. */
  readonly onSelected: () => void;
}) {
  const held = useRef(false);
  const dragging = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useRef<(() => void) | null>(null);

  const release = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    stop.current?.();
    stop.current = null;
  };

  // The caret's free end follows the finger: the selection's head, its
  // anchor kept. `taken`, where the end was as the finger took it, kept
  // that far from the finger; displaced, it rises above it.
  const follow = (
    finger: Pointer,
    place: (head: number) => void,
    taken: { readonly x: number; readonly y: number } = finger.start,
  ) => {
    const editor = view.current;
    if (editor === null) return;
    const move = () => {
      const now = { x: finger.x.get(), y: finger.y.get() };
      const head = editor.posAtCoords(aim(finger.start, now, taken, displace));
      if (head !== null) place(head);
    };
    const offX = finger.x.on('change', move);
    const offY = finger.y.on('change', move);
    stop.current = () => {
      offX();
      offY();
    };
  };

  // 2. Hold
  const hold = (finger: Pointer) => {
    const editor = view.current;
    if (editor === null) return;
    if (Math.hypot(finger.dx.get(), finger.dy.get()) > STILL) return;
    const at = editor.posAtCoords({ x: finger.x.get(), y: finger.y.get() });
    if (at === null) return;
    const word = wordAround(editor, at);
    held.current = true;
    navigator.vibrate?.(8);
    editor.dispatch({ selection: { anchor: word.from, head: word.to } });
    onSelected();
    // The free end follows the finger, the word kept whole either way.
    follow(finger, (head) =>
      editor.dispatch({
        selection:
          head < word.from
            ? { anchor: word.to, head }
            : { anchor: word.from, head: Math.max(head, word.to) },
      }),
    );
  };

  // Gone mid-press, nothing of it is left waiting or listening.
  useEffect(() => release, []);

  useGesture({
    enabled,
    // On the caret, or held, the Gesture is the words', whichever way
    // it then moves.
    captures: () => dragging.current || held.current,
    onStart: (pointers) => {
      release();
      held.current = false;
      dragging.current = false;
      const finger = [...pointers.values()][0];
      if (finger === undefined || pointers.size > 1) return;
      // 1. Drag: a cursor moves whole; a selection by the end taken,
      // the other kept.
      const editor = view.current;
      const end = editor === null ? null : takenAt(editor, finger.start);
      if (editor !== null && end !== null) {
        const { taken, kept } = end;
        dragging.current = true;
        onSelected();
        return follow(
          finger,
          (to) =>
            editor.dispatch({ selection: { anchor: kept ?? to, head: to } }),
          taken,
        );
      }
      timer.current = setTimeout(() => hold(finger), HOLD);
    },
    onPointer: (_pointer, pointers) => {
      // A second finger is no selecting.
      if (pointers.size > 1 && !held.current) release();
    },
    onEnd: () => {
      release();
      held.current = false;
      dragging.current = false;
    },
  });
  return null;
}

/**
 * Editing, with Smart Displacement: a finger landing on the caret, or an
 * end of a selection, is kept from iOS, its loupe and its own drag, and
 * drags it as when read only; the keyboard stays up. Any other touch is
 * iOS's own.
 */
export function useEditDrag(
  box: RefObject<HTMLElement | null>,
  view: RefObject<EditorView | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const element = box.current;
    if (!enabled || element === null) return;
    // The drag under way, ended with the effect too.
    let ending: (() => void) | null = null;
    const onStart = (event: TouchEvent) => {
      const editor = view.current;
      const [touch] = event.touches;
      if (editor === null || touch === undefined || event.touches.length > 1)
        return;
      const start = { x: touch.clientX, y: touch.clientY };
      const end = takenAt(editor, start);
      if (end === null) return;
      event.preventDefault();
      const { taken, kept } = end;
      const id = touch.identifier;
      const onMove = (moved: TouchEvent) => {
        const finger = [...moved.touches].find((t) => t.identifier === id);
        if (finger === undefined) return;
        moved.preventDefault();
        const now = { x: finger.clientX, y: finger.clientY };
        const head = editor.posAtCoords(aim(start, now, taken, true));
        if (head !== null)
          editor.dispatch({ selection: { anchor: kept ?? head, head } });
      };
      const onEnd = () => {
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
        window.removeEventListener('touchcancel', onEnd);
        if (ending === onEnd) ending = null;
      };
      ending?.();
      ending = onEnd;
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onEnd);
    };
    element.addEventListener('touchstart', onStart, { passive: false });
    return () => {
      element.removeEventListener('touchstart', onStart);
      ending?.();
    };
  }, [enabled]);
}
