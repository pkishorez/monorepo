import { shapeOf } from './shapes/index.ts';
import type { ShapeName } from './shapes/index.ts';

/*
 * The page's Chapters, as the field sees them: every element marked with
 * `data-field-shape`, in document order, with the side its shape sits on and
 * where its middle is down the page. Read only when the layout may have
 * changed, never per frame.
 */

export type Side = 'left' | 'right' | 'center';

export type Chapter = {
  readonly shape: ShapeName;
  readonly side: Side;
  /** Its middle, in page pixels from the top. */
  readonly middle: number;
};

const sideOf = (value: string | undefined): Side =>
  value === 'left' || value === 'right' ? value : 'center';

export function measure(): Chapter[] {
  const found = [
    ...document.querySelectorAll<HTMLElement>('[data-field-shape]'),
  ];
  const chapters = found.map((el) => {
    const box = el.getBoundingClientRect();
    return {
      shape: shapeOf(el.dataset.fieldShape),
      side: sideOf(el.dataset.fieldSide),
      middle: box.top + window.scrollY + box.height / 2,
    };
  });
  return chapters.length > 0
    ? chapters
    : [{ shape: 'hero', side: 'center', middle: window.innerHeight / 2 }];
}
