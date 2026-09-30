import { useEffect } from 'react';
import type { Side } from './geometry.ts';

type Neighbours = { readonly prev?: string; readonly next?: string };

const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest(
    'input, textarea, select, [contenteditable="true"], [role="slider"], [role="tablist"], [data-stage]',
  ) !== null;

const sideFor = (neighbours: Neighbours, path: string): Side | undefined =>
  path === neighbours.next
    ? 'next'
    : path === neighbours.prev
      ? 'prev'
      : undefined;

/**
 * The inputs that turn a page besides a Swipe: the arrow keys, and a plain
 * click on any same-origin link to the current page's previous or next page.
 * `turn` answers whether it took the input; one it did not take goes on as usual.
 */
export function useTurnInputs(
  neighbours: () => Neighbours,
  turn: (side: Side) => boolean,
) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        editable(event.target)
      ) {
        return;
      }
      const side =
        event.key === 'ArrowRight'
          ? 'next'
          : event.key === 'ArrowLeft'
            ? 'prev'
            : undefined;
      if (side !== undefined && turn(side)) event.preventDefault();
    };

    // Capture phase, so it runs before the router's own link handler.
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const link = event.target.closest('a[href]');
      if (
        !(link instanceof HTMLAnchorElement) ||
        (link.target !== '' && link.target !== '_self') ||
        link.hasAttribute('download')
      ) {
        return;
      }
      const url = new URL(link.href);
      if (
        url.origin !== location.origin ||
        url.search !== '' ||
        url.hash !== ''
      ) {
        return;
      }
      const side = sideFor(neighbours(), url.pathname);
      if (side !== undefined && turn(side)) event.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick, true);
    };
  }, [neighbours, turn]);
}
