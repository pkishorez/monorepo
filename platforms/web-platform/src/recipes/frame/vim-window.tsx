import type { ReactNode } from 'react';

/** Only the status line moves: one curve and one length. */
const SWITCH =
  'duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none';

/**
 * The whole screen, which with `floating` is a window once the screen is
 * wider than the window can be (1624px: its 1600 and its padding either
 * side): at most 1600 by 1200, centred, inset by that padding, rounded,
 * with a layered shadow over a backdrop of its own. Narrower, it stays the
 * whole screen. It is the same in Vim Mode and out of it, so turning it on
 * or off never moves the page.
 * With `on`, `statusLine` eases in as its bottom edge. Its shadow and
 * backdrop are the theme's `--vim-window-*`.
 */
export function VimWindow(props: {
  readonly floating: boolean;
  readonly on: boolean;
  readonly statusLine: ReactNode;
  readonly children: ReactNode;
}) {
  const floating = props.floating ? '' : undefined;
  const on = props.on ? '' : undefined;
  return (
    <div
      data-slot="vim-window"
      data-floating={floating}
      data-on={on}
      className="relative flex h-dvh items-center justify-center bg-background min-[1624px]:data-floating:p-3"
    >
      {props.floating ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden bg-(image:--vim-window-backdrop) bg-(--vim-window-backdrop-color) min-[1624px]:block"
        />
      ) : null}
      <div
        data-slot="vim-window-pane"
        data-floating={floating}
        className="relative flex size-full max-h-full max-w-full min-h-0 flex-col overflow-hidden bg-background min-[1624px]:data-floating:max-h-300 min-[1624px]:data-floating:max-w-400 min-[1624px]:data-floating:rounded-xl min-[1624px]:data-floating:shadow-(--vim-window-shadow)"
      >
        {props.children}
        {props.statusLine === undefined ? null : (
          <div
            data-slot="vim-window-status"
            data-on={on}
            inert={!props.on}
            className={`grid shrink-0 grid-rows-[0fr] transition-[grid-template-rows] data-on:grid-rows-[1fr] ${SWITCH}`}
          >
            <div className="min-h-0 overflow-hidden">{props.statusLine}</div>
          </div>
        )}
      </div>
    </div>
  );
}
