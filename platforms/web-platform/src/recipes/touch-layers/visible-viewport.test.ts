import { describe, expect, it } from 'vitest';
import {
  createTallest,
  overBox,
  type Viewport,
  visibleOf,
} from './visible-viewport.ts';

/*
 * What the on-screen keyboard leaves of the page, from what the page and
 * `window.visualViewport` say. Numbers from Mobile Safari on the iOS 27
 * Simulator, an iPhone 18 Pro: the page 714 tall with Safari's toolbar.
 */

const at = (viewport: Partial<Viewport>): Viewport => ({
  layout: 714,
  tallest: 714,
  offsetTop: 0,
  pageTop: 0,
  height: 714,
  scale: 1,
  field: false,
  ...viewport,
});

describe('a layer fixed to the page', () => {
  it('has all of the page, and the home indicator its room, with no keyboard', () => {
    expect(visibleOf(at({}))).toEqual({
      top: 0,
      height: 714,
      bottom: 0,
      keyboard: false,
    });
  });

  it('sits on the keyboard where iOS 27 pans the page and shrinks innerHeight', () => {
    // A field near the top of a tall Drawer: iOS panned 233 to show it;
    // innerHeight was 481, so innerHeight - offsetTop - height said -136,
    // and the Drawer's foot stayed 97 under the keyboard.
    expect(
      visibleOf(at({ offsetTop: 233, pageTop: 233, height: 384, field: true })),
    ).toEqual({ top: 233, height: 384, bottom: 97, keyboard: true });
  });

  it('needs no lift where iOS 27 panned all the way, the keyboard up still', () => {
    // A field at the Drawer's foot: panned 328, the whole height.
    expect(
      visibleOf(at({ offsetTop: 328, pageTop: 328, height: 386, field: true })),
    ).toEqual({ top: 328, height: 386, bottom: 0, keyboard: true });
  });

  it('sits on the keyboard on iOS 18, which pans and shrinks innerHeight the same', () => {
    // An iPhone 16 on iOS 18's Simulator, the page 659 tall: panned 175,
    // innerHeight 484, so innerHeight - offsetTop - height said -81.
    expect(
      visibleOf(
        at({
          layout: 659,
          tallest: 659,
          offsetTop: 174.65625,
          pageTop: 174.65625,
          height: 390.65625,
          field: true,
        }),
      ),
    ).toEqual({ top: 175, height: 391, bottom: 94, keyboard: true });
  });

  it('sits on the keyboard where the page is not panned at all', () => {
    expect(visibleOf(at({ height: 400, field: true }))).toEqual({
      top: 0,
      height: 400,
      bottom: 314,
      keyboard: true,
    });
  });

  it('needs no lift where Android resizes the page, the keyboard up still', () => {
    // interactive-widget=resizes-content: the layout viewport shrinks too.
    expect(
      visibleOf(at({ layout: 420, height: 420, tallest: 780, field: true })),
    ).toEqual({ top: 0, height: 420, bottom: 0, keyboard: true });
  });

  it('lifts nothing where Chrome on Android resizes the page, Gboard up, and up taller for its emoji', () => {
    // Chrome 113 on a Pixel 3a, Android 14, the page 704 tall with
    // `interactive-widget=resizes-content`: Gboard's letters leave 429,
    // its emoji 405; the layout viewport is what is seen, so a Drawer at
    // its foot already sits on the keyboard.
    const android = { tallest: 704, field: true };
    expect(visibleOf(at({ ...android, layout: 429, height: 429 }))).toEqual({
      top: 0,
      height: 429,
      bottom: 0,
      keyboard: true,
    });
    expect(visibleOf(at({ ...android, layout: 405, height: 405.09 }))).toEqual({
      top: 0,
      height: 405,
      bottom: 0,
      keyboard: true,
    });
  });

  it('sits on the keyboard where Chrome on Android pans the page, as with no interactive-widget', () => {
    // The same Chrome with only `width=device-width`: it leaves the
    // layout viewport 704 tall and pans 268 to show the field, as iOS.
    expect(
      visibleOf(
        at({
          layout: 704,
          tallest: 704,
          offsetTop: 268,
          pageTop: 268,
          height: 430,
          field: true,
        }),
      ),
    ).toEqual({ top: 268, height: 430, bottom: 6, keyboard: true });
  });

  it('says no keyboard once Back hides it on Android, the field still focused', () => {
    // Back hides Gboard but leaves the focus where it was.
    expect(
      visibleOf(at({ layout: 704, tallest: 704, height: 704, field: true })),
    ).toEqual({ top: 0, height: 704, bottom: 0, keyboard: false });
  });

  it('says no keyboard for a shorter view with no field, as Safari’s toolbar folding', () => {
    expect(visibleOf(at({ height: 560 })).keyboard).toBe(false);
  });

  it('says no keyboard, and lifts nothing, while pinch-zoomed', () => {
    expect(
      visibleOf(at({ height: 300, offsetTop: 100, scale: 2, field: true })),
    ).toMatchObject({ bottom: 0, keyboard: false });
  });

  it('lifts nothing where iOS 26 leaves offsetTop behind once the keyboard is down', () => {
    expect(
      visibleOf(at({ offsetTop: 24, pageTop: 24, height: 690 })).bottom,
    ).toBe(0);
  });
});

describe('a box in the page, such as the Question Panel’s sheet', () => {
  // Its box under the header, 57 to 714.
  it('leaves it as it is while nothing is hidden', () => {
    expect(
      overBox(
        { top: 57, bottom: 714 },
        { pageTop: 0, height: 714, scale: 1 },
        0,
        12,
      ),
    ).toEqual({ covered: 0, room: null });
  });

  it('lifts its foot over the keyboard where iOS pans the page and shrinks innerHeight', () => {
    // The page panned 141 under the keyboard, the box with it, and
    // innerHeight 573: from innerHeight, little would seem hidden.
    expect(
      overBox(
        { top: -84, bottom: 573 },
        { pageTop: 141, height: 384, scale: 1 },
        141,
        12,
      ),
    ).toEqual({ covered: 189, room: 561 });
  });

  it('lifts its foot where the page is not panned, as on older iOS', () => {
    expect(
      overBox(
        { top: 57, bottom: 714 },
        { pageTop: 0, height: 400, scale: 1 },
        0,
        12,
      ),
    ).toEqual({ covered: 314, room: 645 });
  });

  it('keeps its head in sight when what is seen starts lower in the page', () => {
    expect(
      overBox(
        { top: 0, bottom: 714 },
        { pageTop: 100, height: 300, scale: 1 },
        0,
        12,
      ),
    ).toEqual({ covered: 314, room: 602 });
  });

  it('lifts nothing where Android resized the page to what is seen', () => {
    expect(
      overBox(
        { top: 57, bottom: 420 },
        { pageTop: 0, height: 420, scale: 1 },
        0,
        12,
      ),
    ).toEqual({ covered: 0, room: null });
  });
});

describe('the tallest the page has been, what a keyboard is measured against', () => {
  it('grows with the page while no field has focus', () => {
    const tallest = createTallest();
    expect(tallest(390, 660, false)).toBe(660);
    expect(tallest(390, 714, false)).toBe(714);
    expect(tallest(390, 660, false)).toBe(714);
  });

  it('keeps the height from before a field took focus, as Android shrinks the page under its keyboard', () => {
    const tallest = createTallest();
    tallest(412, 704, false);
    expect(tallest(412, 429, true)).toBe(704);
    // A taller page read with a field says nothing: the keyboard may fall.
    expect(tallest(412, 704, true)).toBe(704);
    expect(tallest(412, 429, true)).toBe(704);
  });

  it('starts again at a new width, as the phone turns', () => {
    const tallest = createTallest();
    tallest(390, 714, false);
    expect(tallest(844, 340, false)).toBe(340);
    expect(tallest(390, 714, false)).toBe(714);
  });
});
