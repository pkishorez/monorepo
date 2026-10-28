import { describe, expect, it } from 'vitest';
import { keyboardOver } from '../dialog/sheet.ts';

/*
 * What the on-screen keyboard leaves the sheet, from where its box is in
 * the page and what of the page can be seen. Numbers from iOS 27's Mobile
 * Safari on an iPhone 18 Pro, its box under the header, 57 to 714.
 */

describe('the sheet over the on-screen keyboard', () => {
  it('leaves the sheet as it is while nothing is hidden', () => {
    expect(
      keyboardOver({ top: 57, bottom: 714 }, { pageTop: 0, height: 714 }, 0),
    ).toEqual({ covered: 0, room: null });
  });

  it('lifts its foot over the keyboard where iOS scrolls the page and shrinks innerHeight', () => {
    // The page scrolled 141 under the keyboard, the box with it, and
    // innerHeight 573: from innerHeight, nothing would seem hidden.
    expect(
      keyboardOver(
        { top: -84, bottom: 573 },
        { pageTop: 141, height: 384 },
        141,
      ),
    ).toEqual({ covered: 189, room: 561 });
  });

  it('lifts its foot where the page is not scrolled, as on older iOS', () => {
    expect(
      keyboardOver({ top: 57, bottom: 714 }, { pageTop: 0, height: 400 }, 0),
    ).toEqual({ covered: 314, room: 645 });
  });

  it('keeps its head in sight when the visual viewport is scrolled within the page', () => {
    // Zoomed or panned: what can be seen starts 100 below the page's top.
    expect(
      keyboardOver({ top: 0, bottom: 714 }, { pageTop: 100, height: 300 }, 0),
    ).toEqual({ covered: 314, room: 602 });
  });
});
