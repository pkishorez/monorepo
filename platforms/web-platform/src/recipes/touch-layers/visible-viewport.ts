import { type CSSProperties, useEffect, useState } from 'react';

/*
 * The part of the page the person can see, as CSS variables for a layer
 * fixed at the top, and how much of the page's foot is hidden, for one
 * fixed at the bottom. iOS draws its keyboard over the page without resizing
 * the layout viewport, and may scroll it: only `window.visualViewport`
 * knows what is left. Android resizes the page itself
 * (`interactive-widget=resizes-content`), where the two agree.
 */

type Visible = {
  readonly top: number;
  readonly height: number;
  readonly bottom: number;
};

const read = (): Visible | null => {
  // Some browsers, and jsdom, have none.
  const viewport = window.visualViewport ?? null;
  return viewport === null
    ? null
    : {
        top: viewport.offsetTop,
        height: viewport.height,
        bottom: Math.max(
          0,
          window.innerHeight - viewport.offsetTop - viewport.height,
        ),
      };
};

/** `--visible-top`, `--visible-height` and `--visible-bottom`, live while `on`. */
export const useVisibleViewport = (on: boolean): CSSProperties => {
  const [visible, setVisible] = useState<Visible | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport ?? null;
    if (!on || viewport === null) return;
    const update = () => setVisible(read());
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [on]);
  return visible === null
    ? {}
    : ({
        '--visible-top': `${visible.top}px`,
        '--visible-height': `${visible.height}px`,
        '--visible-bottom': `${visible.bottom}px`,
      } as CSSProperties);
};
