import { shapeOf } from './shapes/index.ts';
import type { ShapeName } from './shapes/index.ts';

/*
 * The page's Chapters, as the field sees them: every element marked with
 * `data-field-shape`, in document order, with the side its shape sits on and
 * where its middle is down the page: the middle of its words, marked
 * `data-field-words`, when it has them, so a shape is whole while its words
 * are being read. Read only when the layout may have changed, never per
 * frame.
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
    const words = el.querySelector<HTMLElement>('[data-field-words]') ?? el;
    const box = words.getBoundingClientRect();
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

/**
 * Where the story ends, down the page: the top of what a page marks
 * `data-field-end`, the first words after its last Chapter; none if it
 * marks nothing.
 */
export function storyEnd(): number | null {
  const end = document.querySelector<HTMLElement>('[data-field-end]');
  return end ? end.getBoundingClientRect().top + window.scrollY : null;
}

/** Where the story's first words start, down the page; none on a page with no story. */
export function storyStart(): number | null {
  const first = document.querySelector<HTMLElement>('[data-field-words]');
  return first ? first.getBoundingClientRect().top + window.scrollY : null;
}
