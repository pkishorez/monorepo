import { EditorView } from '@codemirror/view';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { useEffect, useRef, type MouseEvent, type RefObject } from 'react';
import { useCaret } from './caret.ts';
import { SwipeZone, type Swipes } from './swipe.tsx';

/*
 * The Touch Draft's words, scrolling up and down inside their own height.
 *
 * 1. Read only  in voice mode a tap puts the caret where it lands, no
 *               keyboard raised, so the next Dictation goes there; in text
 *               mode a tap edits. An empty Draft's placeholder edits it.
 *               The caret is drawn and kept in view (`caret.ts`), so text
 *               coming in shows.
 * 2. Editing    the Composer: the caret is the editor's own, and it stays
 *               in view as the words' size changes, as when the keyboard
 *               rises.
 * 3. Swipe      sideways, what `swipes` says for that way (`swipe.tsx`);
 *               a way it says nothing for goes on to the sidebar.
 */

/** What the words draw of the Draft's editor. */
type Editor = {
  /** The ref that moves the editor into the words. */
  readonly mount: (element: HTMLDivElement | null) => void;
  readonly view: RefObject<EditorView | null>;
  readonly placeholder: string;
  /** Nothing in it yet, nor a Dictation coming. */
  readonly empty: boolean;
};

export function Words({
  editor,
  editing,
  onEdit,
  tapEdits,
  swipes,
  onSwipeMove,
  className,
}: {
  readonly editor: Editor;
  readonly editing: boolean;
  readonly onEdit: () => void;
  /** A tap edits, rather than placing the caret. */
  readonly tapEdits: boolean;
  readonly swipes: Swipes;
  /** How far a Swipe has gone, in px, signed, as it goes; null once it ends. */
  readonly onSwipeMove: (offset: number | null) => void;
  /** Its height and padding. */
  readonly className: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const { caret, moved } = useCaret(
    editor.view,
    !editing && !editor.empty,
    inner,
  );

  // 1. Read only: a tap places the caret, or edits. A Swipe took the
  // press: the click that ends it is no tap.
  const swiped = useRef(false);
  const click = (event: MouseEvent) => {
    if (editing) return;
    if (swiped.current) return void (swiped.current = false);
    // A button in the words, such as Retry, is its own tap.
    if ((event.target as Element).closest('button') !== null) return;
    if (editor.empty) return onEdit();
    const view = editor.view.current;
    const at =
      view?.posAtCoords({ x: event.clientX, y: event.clientY }) ?? null;
    if (view !== null && at !== null)
      view.dispatch({ selection: { anchor: at } });
    moved();
    if (tapEdits) onEdit();
  };
  useEffect(() => {
    const scroller = box.current;
    const content = inner.current;
    if (caret === null || scroller === null || content === null) return;
    const top = caret.top + content.offsetTop;
    const bottom = top + caret.height;
    if (top < scroller.scrollTop) scroller.scrollTop = top - 4;
    else if (bottom > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = bottom - scroller.clientHeight + 4;
  }, [caret?.top, caret?.height]);

  // 2. Editing: as its size changes, the editor's caret stays in view.
  useEffect(() => {
    const scroller = box.current;
    if (!editing || scroller === null) return;
    const observer = new ResizeObserver(() => {
      const view = editor.view.current;
      view?.dispatch({
        effects: EditorView.scrollIntoView(view.state.selection.main.head, {
          y: 'nearest',
          yMargin: 8,
        }),
      });
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [editing]);

  return (
    <SwipeZone
      ref={box}
      swipes={editing ? {} : swipes}
      onMove={onSwipeMove}
      onSwiped={() => void (swiped.current = true)}
      onPointerDown={() => void (swiped.current = false)}
      onClick={click}
      className={cn(
        // Never scrolled sideways, so a sideways Swipe is never a scroll's.
        'relative min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain text-foreground group-data-disabled/draft:opacity-40',
        className,
      )}
    >
      <div ref={inner} className="relative">
        {editor.empty && (
          <p
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 truncate text-muted-foreground"
          >
            {editor.placeholder}
          </p>
        )}
        {/* Read only, its words take no tap; a button in them, such as a
            failed Dictation's Retry, still does. */}
        <div
          ref={editor.mount}
          className={cn(
            !editing && 'pointer-events-none [&_button]:pointer-events-auto',
            !editing && editor.empty && 'opacity-0',
          )}
        />
        {caret !== null && (
          <span
            aria-hidden
            style={{
              transform: `translate(${caret.left}px, ${caret.top}px)`,
              height: caret.height,
            }}
            className="pointer-events-none absolute top-0 left-0 w-0.5 animate-breathe rounded-full bg-primary transition-transform duration-150 ease-out motion-reduce:animate-none motion-reduce:transition-none"
          />
        )}
      </div>
    </SwipeZone>
  );
}
