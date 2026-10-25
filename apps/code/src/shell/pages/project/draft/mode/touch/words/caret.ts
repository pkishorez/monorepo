import type { EditorView } from '@codemirror/view';
import { useEffect, useRef, useState, type RefObject } from 'react';

/*
 * Where the caret is drawn while the words are read only, measured again
 * only as something changes: the words, their size, or `moved`, as a tap
 * moves it. Not a frame at a time, which would keep the page busy under
 * every touch.
 */

type Caret = {
  readonly top: number;
  readonly left: number;
  readonly height: number;
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
    const at = editor.coordsAtPos(editor.state.selection.main.head);
    if (at === null) return;
    const { top, left } = box.getBoundingClientRect();
    const next = {
      top: Math.round(at.top - top),
      left: Math.round(at.left - left),
      height: Math.round(at.bottom - at.top),
    };
    setCaret((now) =>
      now?.top === next.top &&
      now.left === next.left &&
      now.height === next.height
        ? now
        : next,
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
    const mutations = new MutationObserver(soon);
    mutations.observe(box, {
      subtree: true,
      childList: true,
      characterData: true,
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
