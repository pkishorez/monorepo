import { useEffect, useRef } from 'react';

/*
 * The journey's quiet companion: how far through the chapters you are.
 * Where the screen leaves it room, a thin line down the left edge with a
 * dot per chapter that fills once its chapter reaches the middle of the
 * screen; anywhere narrower, a hairline under the header. Scrolling writes
 * straight to the elements' styles, once a frame at most, so React does
 * not draw again as you go.
 */

/** How far through the chapters the middle of the screen is, from 0 to count - 1. */
const reached = (sections: ReadonlyArray<Element>): number => {
  const middle = window.innerHeight / 2;
  let value = 0;
  sections.forEach((section, index) => {
    const { top, height } = section.getBoundingClientRect();
    if (top <= middle)
      value = index + Math.min(1, (middle - top) / height) - 0.5;
  });
  return Math.max(0, Math.min(sections.length - 1, value));
};

export function Rail({ count }: { readonly count: number }) {
  const fill = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const dots = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const sections = [...document.querySelectorAll('[data-chapter]')];
    let frame = 0;
    const draw = () => {
      frame = 0;
      const value = reached(sections);
      const progress = sections.length > 1 ? value / (sections.length - 1) : 0;
      fill.current?.style.setProperty('transform', `scaleY(${progress})`);
      bar.current?.style.setProperty('transform', `scaleX(${progress})`);
      dots.current.forEach((dot, index) => {
        if (dot) dot.dataset['on'] = String(value >= index - 0.02);
      });
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none">
      <span
        ref={bar}
        className="fixed inset-x-0 top-14 z-30 h-px origin-left scale-x-0 bg-foreground min-[1360px]:hidden"
      />
      <div className="fixed top-1/2 left-6 z-30 hidden h-[40svh] -translate-y-1/2 min-[1360px]:block">
        <span className="absolute inset-y-0 left-0 w-px bg-border" />
        <span
          ref={fill}
          className="absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-foreground"
        />
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            ref={(dot) => {
              dots.current[index] = dot;
            }}
            data-on="false"
            style={{ top: `${(index / Math.max(1, count - 1)) * 100}%` }}
            className="absolute left-0 size-[7px] -translate-x-[3px] -translate-y-1/2 rounded-full border border-border bg-background transition-colors duration-200 data-[on=true]:border-foreground data-[on=true]:bg-foreground motion-reduce:transition-none"
          />
        ))}
      </div>
    </div>
  );
}
