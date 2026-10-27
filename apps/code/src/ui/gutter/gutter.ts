import { useEffect, useState } from 'react';

/*
 * The room a scrollbar takes beside what scrolls: none where scrollbars
 * float over the page, as on a Mac or a phone by default; their width
 * where they sit beside it. A column that scrolls keeps that room on both
 * sides, scrollbar or not (`scrollbar-gutter: stable both-edges`), so it
 * never moves as it grows long enough to scroll. What sits beside it and
 * does not scroll, such as the Draft under a transcript, is inset by the
 * same room on each side, so their edges line up either way.
 */

/**
 * The room a column that scrolls keeps on each side, as this browser keeps
 * it: measured on one, not taken to be a scrollbar's width, since some
 * browsers keep the room even where their scrollbars take none.
 */
const measure = () => {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:-9999px;width:100px;height:100px;overflow-y:auto;scrollbar-gutter:stable both-edges;visibility:hidden';
  document.body.appendChild(probe);
  const room = (probe.offsetWidth - probe.clientWidth) / 2;
  probe.remove();
  return room;
};

/** The room to inset what sits beside a column that scrolls, on each side, in px. */
export const useGutter = () => {
  const [gutter, setGutter] = useState(0);
  useEffect(() => {
    const update = () => setGutter(measure());
    update();
    // A display with another density, or a change to how scrollbars show.
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return gutter;
};

/** The classes for a column that scrolls and keeps a scrollbar's room on both sides. */
export const GUTTERED = '[scrollbar-gutter:stable_both-edges]';
