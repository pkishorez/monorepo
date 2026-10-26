import type { EditorView } from '@codemirror/view';
import { useEffect, useRef, useState, type RefObject } from 'react';

/*
 * Where the caret is drawn while the words are read only, measured again
 * only as something changes: the words, their size, or `moved`, as a tap
 * moves it. Not a frame at a time, which would keep the page busy under
 * every touch. With a selection, the caret is its head, the end that
 * moves, and `anchor` its other end; `forward` when the head is after it;
 * and `bands` its shade, a box a line. All from one measure, so the shade
 * and the ends never disagree: CodeMirror's own are not drawn here.
 */

type Spot = {
  readonly top: number;
  readonly left: number;
  readonly height: number;
};

type Band = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};

type Caret = Spot & {
  readonly anchor: Spot | null;
  readonly forward: boolean;
  readonly bands: readonly Band[];
};

export function useCaret(
  view: RefObject<EditorView | null>,
  shown: boolean,
  inner: RefObject<HTMLDivElement | null>,
) {
  const [caret, setCaret] = useState<Caret | null>(null);
  const measure = useRef<() => void>(() => {});
  measure.current = () => {
    const editor = view.current;
    const box = inner.current;
    if (!shown || editor === null || box === null) return setCaret(null);
    const { anchor, head } = editor.state.selection.main;
    const forward = head > anchor;
    const { top, left } = box.getBoundingClientRect();
    // Each end on the line its selected text is on, not the next one's start.
    const spotOf = (pos: number, side: -1 | 1): Spot | null => {
      const at = editor.coordsAtPos(pos, side);
      return at === null
        ? null
        : {
            top: Math.round(at.top - top),
            left: Math.round(at.left - left),
            height: Math.round(at.bottom - at.top),
          };
    };
    const end = spotOf(head, forward ? -1 : 1);
    if (end === null) return;
    const next: Caret = {
      ...end,
      anchor: anchor === head ? null : spotOf(anchor, forward ? 1 : -1),
      forward,
      bands: anchor === head ? [] : bandsOf(editor, top, left),
    };
    setCaret((now) =>
      now !== null && JSON.stringify(now) === JSON.stringify(next) ? now : next,
    );
  };
  useEffect(() => {
    const box = inner.current;
    measure.current();
    if (!shown || box === null) return;
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure.current());
    };
    // A selection moved restyles CodeMirror's layers rather than adding
    // to them: its attributes say so.
    const mutations = new MutationObserver(soon);
    mutations.observe(box, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    const sizes = new ResizeObserver(soon);
    sizes.observe(box);
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      sizes.disconnect();
    };
  }, [shown]);
  return { caret, moved: () => requestAnimationFrame(() => measure.current()) };
}

/** The main selection's shade: its text's boxes, one a line, from `top` and `left`. */
function bandsOf(editor: EditorView, top: number, left: number): Band[] {
  const { from, to } = editor.state.selection.main;
  const start = editor.domAtPos(from);
  const end = editor.domAtPos(to);
  const range = document.createRange();
  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } catch {
    return [];
  }
  const lines = new Map<
    number,
    { left: number; right: number; top: number; bottom: number }
  >();
  for (const box of range.getClientRects()) {
    if (box.width === 0) continue;
    // Boxes on one line share their middle, whatever their own height.
    const key = Math.round((box.top + box.bottom) / 2 / 4);
    const line = lines.get(key);
    lines.set(
      key,
      line === undefined
        ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
        : {
            left: Math.min(line.left, box.left),
            right: Math.max(line.right, box.right),
            top: Math.min(line.top, box.top),
            bottom: Math.max(line.bottom, box.bottom),
          },
    );
  }
  return [...lines.values()].map((line) => ({
    top: Math.round(line.top - top),
    left: Math.round(line.left - left),
    width: Math.round(line.right - line.left),
    height: Math.round(line.bottom - line.top),
  }));
}
